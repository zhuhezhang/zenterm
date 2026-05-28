/**
 * 在独立 Worker 中运行 SFTP（ssh2），避免 SSH 握手阻塞 Electron 主进程。
 */
import fs from 'fs'
import { parentPort, workerData } from 'worker_threads'
import { Client } from 'ssh2'
import type { SftpClient, SftpDirEntry } from 'ssh2'
import type { AlgorithmPreferences } from '../../shared/sshAlgorithmDefaults.js'
import { DEFAULT_ALGORITHM_PREFERENCES } from '../../shared/sshAlgorithmDefaults.js'
import {
  postWorkerCmdFail,
  postWorkerCmdFailFromThrown,
  postWorkerCmdOk,
} from '../lib/workerCmdResult.js'
import {
  assertSftpLocalDirAllowedForRoots, assertSftpLocalFilePathAllowedForRoots, safeJoinLocalDownloadPathForRoots,
} from '../lib/sftpLocalPathRoots.js'

if (!parentPort) throw new Error('worker_threads parentPort missing')
const port = parentPort

const { config, allowedRoots } = workerData as {
  config: Record<string, unknown>
  allowedRoots: string[]
}

/**
 * 构建连接配置
 * @param cfg 配置
 * @param hostVerifier 主机公钥校验器
 * @returns 连接配置
 */
function buildConnectConfig(
  cfg: Record<string, unknown>,
  hostVerifier: (key: Buffer, callback: (ok: boolean) => void) => void,
): Record<string, unknown> {
  const connectConfig: Record<string, unknown> = {
    host: cfg.host,
    port: cfg.port || 22,
    username: cfg.username,
    readyTimeout: 60000,
    keepaliveInterval: 10000,
    hostVerifier,
  }

  const algorithms = cfg.algorithms as Partial<AlgorithmPreferences> | undefined
  if (algorithms && typeof algorithms === 'object') {
    const filtered: Partial<AlgorithmPreferences> = {}
    for (const key in DEFAULT_ALGORITHM_PREFERENCES) {
      const k = key as keyof AlgorithmPreferences
      if (Array.isArray(algorithms[k]) && algorithms[k]!.length) {
        filtered[k] = algorithms[k]
      }
    }
    if (Object.keys(filtered).length) {
      connectConfig.algorithms = filtered
    }
  }
  if (!connectConfig.algorithms) {
    connectConfig.algorithms = DEFAULT_ALGORITHM_PREFERENCES
  }

  if (cfg.authType === 'password') {
    connectConfig.password = cfg.password
  } else if (cfg.authType === 'privateKey') {
    connectConfig.privateKey = cfg.privateKey
    if (cfg.passphrase) connectConfig.passphrase = cfg.passphrase
  }

  return connectConfig
}

/** 主机公钥校验序列号 */
let verifySeq = 0
/** 主机公钥校验回调函数 */
const verifyCallbacks = new Map<number, (ok: boolean) => void>()
/** 状态对象 */
const state: {
  conn: Client | null
  sftp: SftpClient | null
  closedPosted: boolean
} = {
  conn: null,
  sftp: null,
  closedPosted: false,
}

/**
 * 主机公钥校验器
 * @param {Buffer} key 主机公钥
 * @param {function} callback 回调函数
 */
function hostVerifier(key: Buffer, callback: (ok: boolean) => void) {
  const raw = Buffer.isBuffer(key) ? key : Buffer.from(key)
  const reqId = ++verifySeq
  verifyCallbacks.set(reqId, callback)
  port.postMessage({  // 发送消息到主线程
    type: 'HOST_VERIFY',
    reqId,
    host: config.host,
    port: config.port || 22,
    keyBase64: raw.toString('base64'),
  })
}

/**
 * 读取远程目录
 * @param {string} remotePath 远程路径
 * @returns {Promise<object[]>} 目录列表
 */
function sftpReaddir(remotePath: string): Promise<SftpDirEntry[]> {
  return new Promise((resolve, reject) => {
    state.sftp!.readdir(remotePath, (err: Error | undefined, list?: SftpDirEntry[]) =>
      err ? reject(err) : resolve(list ?? []),
    )
  })
}

/**
 * 删除远程文件
 * @param {string} remotePath 远程路径
 * @returns {Promise<void>}
 */
function sftpUnlink(remotePath: string) {
  return new Promise<void>((resolve, reject) => {
    state.sftp!.unlink(remotePath, (err: Error | undefined) => (err ? reject(err) : resolve()))
  })
}

/**
 * 删除远程目录
 * @param {string} remotePath 远程路径
 * @returns {Promise<void>}
 */
function sftpRmdir(remotePath: string) {
  return new Promise<void>((resolve, reject) => {
    state.sftp!.rmdir(remotePath, (err: Error | undefined) => (err ? reject(err) : resolve()))
  })
}

/**
 * 删除远程文件或目录
 * @param {string} remotePath 远程路径
 * @returns {Promise<void>}
 */
async function deleteRecursive(remotePath: string) {
  try {
    await sftpUnlink(remotePath)
    return
  } catch {
    /* 可能是目录 */
  }
  let list
  try {
    list = await sftpReaddir(remotePath)
  } catch {
    await sftpRmdir(remotePath)
    return
  }
  for (const item of list) {
    const name = Buffer.isBuffer(item.filename) ? item.filename.toString('utf8') : String(item.filename)
    const child = remotePath === '/' ? `/${name}` : `${remotePath}/${name}`
    if (item.attrs.isDirectory()) await deleteRecursive(child)
    else await sftpUnlink(child)
  }
  await sftpRmdir(remotePath)
}

/**
 * 下载远程目录
 * @param {string} remoteDir 远程目录
 * @param {string} localDir 本地目录
 * @returns {Promise<void>}
 */
async function downloadDirRecursive(remoteDir: string, localDir: string) {
  assertSftpLocalDirAllowedForRoots(localDir, allowedRoots, 'download')
  fs.mkdirSync(localDir, { recursive: true })
  const list = await sftpReaddir(remoteDir)
  for (const item of list) {
    const name = Buffer.isBuffer(item.filename) ? item.filename.toString('utf8') : String(item.filename)
    const remotePath = remoteDir === '/' ? `/${name}` : `${remoteDir}/${name}`
    const localPath = safeJoinLocalDownloadPathForRoots(localDir, name, allowedRoots, 'download')
    if (item.attrs.isDirectory()) {
      await downloadDirRecursive(remotePath, localPath)
    } else {
      await new Promise<void>((resolve, reject) => {
        state.sftp!.fastGet(remotePath, localPath, {
          step: (transferred: number, _chunk: unknown, total_size: number) => {
            port.postMessage({  // 发送进度消息到主线程
              type: 'PROGRESS',
              progress: {
                type: 'download',
                file: remotePath,
                transferred,
                total: total_size,
                percent: total_size ? Math.round((transferred / total_size) * 100) : 0,
              },
            })
          },
        }, (err: Error | undefined) => (err ? reject(err) : resolve(undefined)))
      })
    }
  }
}

/** 操作链 */
let opChain = Promise.resolve()

/**
 * 入队操作
 * @param {function} fn 操作函数
 * @returns {Promise<void>}
 */
function enqueueOp(fn: () => Promise<void>) {
  opChain = opChain.then(fn).catch((e) => {
    console.error('sftpSessionWorker op', e)
  })
  return opChain
}

/**
 * 处理命令
 * @param {object} msg 命令消息
 * @returns {Promise<void>}
 */
async function handleCmd(msg: Record<string, unknown>) {
  const reqId = Number(msg.reqId)
  const cmd = msg.cmd
  if (!state.sftp) {
    postWorkerCmdFail(port, reqId, 'sftp.noSession')
    return
  }
  const sftp = state.sftp
  try {
    switch (cmd) {
      case 'LIST': {
        const list = await sftpReaddir(String(msg.remotePath))
        const base = String(msg.remotePath)
        const items = list
          .map((item) => {
            const name = Buffer.isBuffer(item.filename) ? item.filename.toString('utf8') : String(item.filename)
            const fullPath = base === '/' ? `/${name}` : `${base}/${name}`
            return {
              name,
              path: fullPath,
              isDir: item.attrs.isDirectory(),
              size: item.attrs.size,
              mtime: item.attrs.mtime * 1000,
              permissions: item.attrs.mode,
            }
          })
          .sort((a, b) => {
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
            return a.name.localeCompare(b.name)
          })
        postWorkerCmdOk(port, reqId, { items })
        break
      }
      case 'DOWNLOAD': {
        assertSftpLocalFilePathAllowedForRoots(String(msg.localPath), allowedRoots, 'download')
        await new Promise<void>((resolve, reject) => {
          sftp.fastGet(String(msg.remotePath), String(msg.localPath), {
            step: (transferred: number, _chunk: unknown, total_size: number) => {
              port.postMessage({
                type: 'PROGRESS',
                progress: {
                  type: 'download',
                  file: msg.remotePath,
                  transferred,
                  total: total_size,
                  percent: total_size ? Math.round((transferred / total_size) * 100) : 0,
                },
              })
            },
          }, (err: Error | undefined) => (err ? reject(err) : resolve(undefined)))
        })
        postWorkerCmdOk(port, reqId)
        break
      }
      case 'DOWNLOAD_DIR': {
        await downloadDirRecursive(String(msg.remoteDir), String(msg.localDir))
        postWorkerCmdOk(port, reqId)
        break
      }
      case 'UPLOAD': {
        assertSftpLocalFilePathAllowedForRoots(String(msg.localPath), allowedRoots, 'upload')
        await new Promise<void>((resolve, reject) => {
          sftp.fastPut(String(msg.localPath), String(msg.remotePath), {
            step: (transferred: number, _chunk: unknown, total_size: number) => {
              port.postMessage({
                type: 'PROGRESS',
                progress: {
                  type: 'upload',
                  file: msg.localPath,
                  transferred,
                  total: total_size,
                  percent: total_size ? Math.round((transferred / total_size) * 100) : 0,
                },
              })
            },
          }, (err: Error | undefined) => (err ? reject(err) : resolve(undefined)))
        })
        postWorkerCmdOk(port, reqId)
        break
      }
      case 'MKDIR': {
        await new Promise<void>((resolve, reject) => {
          sftp.mkdir(String(msg.remotePath), (err: Error | undefined) => (err ? reject(err) : resolve(undefined)))
        })
        postWorkerCmdOk(port, reqId)
        break
      }
      case 'DELETE': {
        await deleteRecursive(String(msg.remotePath))
        postWorkerCmdOk(port, reqId)
        break
      }
      case 'RENAME': {
        await new Promise<void>((resolve, reject) => {
          sftp.rename(String(msg.oldPath), String(msg.newPath), (err: Error | undefined) => (err ? reject(err) : resolve(undefined)))
        })
        postWorkerCmdOk(port, reqId)
        break
      }
      default:
        postWorkerCmdFail(port, reqId, 'sftp.unknownCmd', true, { cmd: String(cmd) })
    }
  } catch (e) {
    postWorkerCmdFailFromThrown(port, reqId, e)
  }
}

port.on('message', (msg: Record<string, unknown>) => {
  if (msg.type === 'HOST_VERIFY_RESULT') {
    const reqId = Number(msg.reqId)
    const cb = verifyCallbacks.get(reqId)
    verifyCallbacks.delete(reqId)
    if (typeof cb === 'function') cb(!!msg.ok)
    return
  }
  if (msg.type === 'DISCONNECT') {
    try {
      state.conn?.end()
    } catch {}
    return
  }
  if (msg.type === 'CMD') {
    void enqueueOp(() => handleCmd(msg))
  }
})

/** 是否已发送失败消息 */
let failSent = false
/**
 * 发送失败消息
 * @param {string} message 错误消息
 */
function postFail(message: string) {
  if (failSent) return
  failSent = true
  port.postMessage({ type: 'CONNECT_FAILED', error: message })
}

/** 发送关闭消息 */
function postClosed() {
  if (state.closedPosted) return
  state.closedPosted = true
  port.postMessage({ type: 'CLOSED' })
}

state.conn = new Client()
const conn = state.conn
conn.on('ready', () => {
  conn.sftp((err: Error | undefined, sftp: SftpClient) => {
    if (err) {
      try {
        conn.end()
      } catch {}
      postFail(err.message)
      return
    }
    state.sftp = sftp
    conn.on('close', postClosed)
    port.postMessage({ type: 'READY' })
  })
})

conn.on('error', (...args: unknown[]) => {
  const err = args[0]
  postFail(err instanceof Error ? err.message : String(err))
})

try {
  conn.connect(buildConnectConfig(config, hostVerifier))
} catch (e) {
  postFail(e instanceof Error ? e.message : String(e))
}
