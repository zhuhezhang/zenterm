/**
 * 在独立 Worker 中运行 ssh2 客户端，避免 SSH 握手（DH 等）阻塞 Electron 主进程事件循环导致界面卡死。
 */
import { parentPort, workerData } from 'worker_threads'
import { Client } from 'ssh2'
import type { Duplex } from 'node:stream'
import type { AlgorithmPreferences } from '../../shared/sshAlgorithmDefaults.js'
import { DEFAULT_ALGORITHM_PREFERENCES } from '../../shared/sshAlgorithmDefaults.js'
import { bufferToBinaryWire } from '../lib/terminalEncodingService.js'

if (!parentPort) throw new Error('worker_threads parentPort missing')
const port = parentPort

const { config } = workerData as { config: Record<string, unknown> }

/**
 * 构建连接配置，用于 SSH 连接
 * @param {object} cfg 配置
 * @param {object} cfg.host 主机名
 * @param {number} cfg.port 端口
 * @param {string} cfg.username 用户名
 * @param {object} cfg.algorithms 算法
 * @param {string} cfg.algorithms.kex 密钥交换算法
 * @param {string} cfg.algorithms.serverHostKey 服务器主机密钥算法
 * @param {string} cfg.algorithms.cipher 加密算法
 * @param {string} cfg.algorithms.hmac 消息认证码算法
 * @param {string} cfg.algorithms.compress 压缩算法
 * @param {function} hostVerifier 主机公钥校验器
 * @returns {object} 连接配置
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

type SshShellStream = Duplex & {
  stderr: Duplex
  setWindow: (rows: unknown, cols: unknown) => void
  close?: () => void
}

/** 状态对象 */
const state: {
  conn: Client | null
  stream: SshShellStream | null
  closedPosted: boolean
} = {
  conn: null,
  stream: null,
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
  })  // ssh2 的 hostVerifier 在 Worker 里，但 弹框必须在主进程（要 dialog 和 BrowserWindow），所以发消息到主线程
}

port.on('message', (msg: Record<string, unknown>) => {
  if (msg.type === 'HOST_VERIFY_RESULT') {
    const reqId = Number(msg.reqId)
    const cb = verifyCallbacks.get(reqId)
    verifyCallbacks.delete(reqId)
    if (typeof cb === 'function') cb(!!msg.ok)
    return
  }
  if (msg.type === 'WRITE') {
    if (state.stream && !state.stream.destroyed) {
      const buf = Buffer.isBuffer(msg.data)
        ? msg.data
        : Buffer.from(msg.data as string | ArrayLike<number>)
      state.stream.write(buf)
    }
    return
  }
  if (msg.type === 'RESIZE') {
    if (state.stream && !state.stream.destroyed) {
      state.stream.setWindow(msg.rows, msg.cols)
    }
    return
  }
  if (msg.type === 'DISCONNECT') {
    try {
      if (state.stream && typeof state.stream.close === 'function') {
        state.stream.close()
      } else if (state.stream) {
        state.stream.end()
      }
    } catch {}
    setTimeout(() => {
      try {
        state.conn?.end()
      } catch {}
    }, 50)
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
  conn.shell({ term: 'xterm-256color' }, (err: Error | undefined, stream: SshShellStream) => {
    if (err) {
      try {
        conn.end()
      } catch {}
      postFail(err.message)
      return
    }
    state.stream = stream
    stream.on('data', (data: Buffer) => {
      port.postMessage({ type: 'OUTPUT', data: bufferToBinaryWire(data) })
    })
    stream.stderr.on('data', (data: Buffer) => {
      port.postMessage({ type: 'OUTPUT', data: bufferToBinaryWire(data) })
    })
    stream.on('close', postClosed)
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
