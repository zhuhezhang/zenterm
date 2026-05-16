/**
 * 在独立 Worker 中运行 SFTP（ssh2），避免 SSH 握手阻塞 Electron 主进程。
 */
import fs from 'fs'
import { parentPort, workerData } from 'worker_threads'
import { Client } from 'ssh2'
import { DEFAULT_ALGORITHM_PREFERENCES } from '../../shared/sshAlgorithmDefaults.js'
import {
  assertSftpLocalDirAllowedForRoots,
  assertSftpLocalFilePathAllowedForRoots,
  safeJoinLocalDownloadPathForRoots,
} from '../lib/sftpLocalPathRoots.js'

const { _sessionId, config, allowedRoots } = workerData

/** 
 * 发送消息到主线程
 * @param {object} m 消息
 */
function post(m) {
  parentPort.postMessage(m)
}

/**
 * 构建连接配置
 * @param {object} cfg 配置
 * @param {function} hostVerifier 主机公钥校验器
 * @returns {object} 连接配置
 */
function buildConnectConfig(cfg, hostVerifier) {
  const connectConfig = {
    host: cfg.host,
    port: cfg.port || 22,
    username: cfg.username,
    readyTimeout: 60000,
    keepaliveInterval: 10000,
    hostVerifier,
  }

  if (cfg.algorithms && typeof cfg.algorithms === 'object') {
    const filtered = {}
    for (const key in DEFAULT_ALGORITHM_PREFERENCES) {
      if (Array.isArray(cfg.algorithms[key]) && cfg.algorithms[key].length) {
        filtered[key] = cfg.algorithms[key]
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
const verifyCallbacks = new Map()
/** 状态对象 */
const state = {
  conn: null,  // SSH 连接
  sftp: null,  // SFTP 会话
  closedPosted: false,  // 是否已发送关闭消息
}

/**
 * 主机公钥校验器
 * @param {Buffer} key 主机公钥
 * @param {function} callback 回调函数
 */
function hostVerifier(key, callback) {
  const raw = Buffer.isBuffer(key) ? key : Buffer.from(key)
  const reqId = ++verifySeq
  verifyCallbacks.set(reqId, callback)
  post({
    type: 'HOST_VERIFY',
    reqId,
    host: config.host,
    port: config.port || 22,
    keyBase64: raw.toString('base64'),
  })
}

/**
 * 发送进度消息
 * @param {object} payload 进度消息
 */
function sendProgress(payload) {
  post({ type: 'PROGRESS', progress: payload })
}

/**
 * 远程文件名
 * @param {string} name 文件名
 * @returns {string} 远程文件名
 */
function remoteEntryName(name) {
  return Buffer.isBuffer(name) ? name.toString('utf8') : String(name)
}

/**
 * 读取远程目录
 * @param {string} remotePath 远程路径
 * @returns {Promise<object[]>} 目录列表
 */
function sftpReaddir(remotePath) {
  return new Promise((resolve, reject) => {
    state.sftp.readdir(remotePath, (err, list) => (err ? reject(err) : resolve(list)))
  })
}

/**
 * 删除远程文件
 * @param {string} remotePath 远程路径
 * @returns {Promise<void>}
 */
function sftpUnlink(remotePath) {
  return new Promise((resolve, reject) => {
    state.sftp.unlink(remotePath, (err) => (err ? reject(err) : resolve()))
  })
}

/**
 * 删除远程目录
 * @param {string} remotePath 远程路径
 * @returns {Promise<void>}
 */
function sftpRmdir(remotePath) {
  return new Promise((resolve, reject) => {
    state.sftp.rmdir(remotePath, (err) => (err ? reject(err) : resolve()))
  })
}

/**
 * 删除远程文件或目录
 * @param {string} remotePath 远程路径
 * @returns {Promise<void>}
 */
async function deleteRecursive(remotePath) {
  try {
    await sftpUnlink(remotePath)
    return
  } catch (_) {
    /* 可能是目录 */
  }
  let list
  try {
    list = await sftpReaddir(remotePath)
  } catch (_) {
    await sftpRmdir(remotePath)
    return
  }
  for (const item of list) {
    const name = remoteEntryName(item.filename)
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
async function downloadDirRecursive(remoteDir, localDir) {
  assertSftpLocalDirAllowedForRoots(localDir, allowedRoots, '下载')
  fs.mkdirSync(localDir, { recursive: true })
  const list = await sftpReaddir(remoteDir)
  for (const item of list) {
    const name = remoteEntryName(item.filename)
    const remotePath = remoteDir === '/' ? `/${name}` : `${remoteDir}/${name}`
    const localPath = safeJoinLocalDownloadPathForRoots(localDir, name, allowedRoots, '下载')
    if (item.attrs.isDirectory()) {
      await downloadDirRecursive(remotePath, localPath)
    } else {
      await new Promise((resolve, reject) => {
        state.sftp.fastGet(remotePath, localPath, {
          step: (transferred, _chunk, total_size) => {
            sendProgress({
              type: 'download',
              file: remotePath,
              transferred,
              total: total_size,
              percent: total_size ? Math.round((transferred / total_size) * 100) : 0,
            })
          },
        }, (err) => (err ? reject(err) : resolve()))
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
function enqueueOp(fn) {
  opChain = opChain.then(fn).catch((e) => {
    console.error('sftpSessionWorker op', e)
  })
  return opChain
}

/**
 * 发送命令结果
 * @param {number} reqId 请求 ID
 * @param {boolean} success 是否成功
 * @param {object} extra 额外信息
 */
function postCmdResult(reqId, success, extra = {}) {
  post({ type: 'CMD_RESULT', reqId, success, ...extra })
}

/**
 * 处理命令
 * @param {object} msg 命令消息
 * @returns {Promise<void>}
 */
async function handleCmd(msg) {
  const { reqId, cmd } = msg
  if (!state.sftp) {
    postCmdResult(reqId, false, { error: 'No SFTP session' })
    return
  }
  try {
    switch (cmd) {
      case 'LIST': {
        const list = await sftpReaddir(msg.remotePath)
        const items = list
          .map((item) => {
            const name = remoteEntryName(item.filename)
            const base = msg.remotePath
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
        postCmdResult(reqId, true, { items })
        break
      }
      case 'DOWNLOAD': {
        assertSftpLocalFilePathAllowedForRoots(msg.localPath, allowedRoots, '下载')
        await new Promise((resolve, reject) => {
          state.sftp.fastGet(msg.remotePath, msg.localPath, {
            step: (transferred, _chunk, total_size) => {
              sendProgress({
                type: 'download',
                file: msg.remotePath,
                transferred,
                total: total_size,
                percent: total_size ? Math.round((transferred / total_size) * 100) : 0,
              })
            },
          }, (err) => (err ? reject(err) : resolve()))
        })
        postCmdResult(reqId, true)
        break
      }
      case 'DOWNLOAD_DIR': {
        await downloadDirRecursive(msg.remoteDir, msg.localDir)
        postCmdResult(reqId, true)
        break
      }
      case 'UPLOAD': {
        assertSftpLocalFilePathAllowedForRoots(msg.localPath, allowedRoots, '上传')
        await new Promise((resolve, reject) => {
          state.sftp.fastPut(msg.localPath, msg.remotePath, {
            step: (transferred, _chunk, total_size) => {
              sendProgress({
                type: 'upload',
                file: msg.localPath,
                transferred,
                total: total_size,
                percent: total_size ? Math.round((transferred / total_size) * 100) : 0,
              })
            },
          }, (err) => (err ? reject(err) : resolve()))
        })
        postCmdResult(reqId, true)
        break
      }
      case 'MKDIR': {
        await new Promise((resolve, reject) => {
          state.sftp.mkdir(msg.remotePath, (err) => (err ? reject(err) : resolve()))
        })
        postCmdResult(reqId, true)
        break
      }
      case 'DELETE': {
        await deleteRecursive(msg.remotePath)
        postCmdResult(reqId, true)
        break
      }
      case 'RENAME': {
        await new Promise((resolve, reject) => {
          state.sftp.rename(msg.oldPath, msg.newPath, (err) => (err ? reject(err) : resolve()))
        })
        postCmdResult(reqId, true)
        break
      }
      default:
        postCmdResult(reqId, false, { error: `Unknown cmd: ${cmd}` })
    }
  } catch (e) {
    postCmdResult(reqId, false, { error: e?.message || String(e) })
  }
}

parentPort.on('message', (msg) => {  // 监听主线程发送的消息
  if (msg.type === 'HOST_VERIFY_RESULT') {
    const cb = verifyCallbacks.get(msg.reqId)
    verifyCallbacks.delete(msg.reqId)
    if (typeof cb === 'function') cb(!!msg.ok)
    return
  }
  if (msg.type === 'DISCONNECT') {
    try {
      state.conn?.end()
    } catch (_) {}
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
function postFail(message) {
  if (failSent) return
  failSent = true
  post({ type: 'CONNECT_FAILED', error: message })
}

/** 发送关闭消息 */
function postClosed() {
  if (state.closedPosted) return
  state.closedPosted = true
  post({ type: 'CLOSED' })
}

state.conn = new Client()
state.conn.on('ready', () => {  // 监听 SSH 连接就绪事件
  state.conn.sftp((err, sftp) => {
    if (err) {
      try {
        state.conn.end()
      } catch (_) {}
      postFail(err.message)
      return
    }
    state.sftp = sftp
    state.conn.on('close', postClosed)
    post({ type: 'READY' })
  })
})

state.conn.on('error', (err) => {  // 监听 SSH 连接错误事件
  postFail(err.message)
})

try {
  state.conn.connect(buildConnectConfig(config, hostVerifier))  // 连接 SSH 服务器
} catch (e) {
  postFail(e.message)  // 发送失败消息
}
