/**
 * 在独立 Worker 中运行 ssh2 客户端，避免 SSH 握手（DH 等）阻塞 Electron 主进程事件循环导致界面卡死。
 */
import { parentPort, workerData } from 'worker_threads'
import { Client } from 'ssh2'
import { DEFAULT_ALGORITHM_PREFERENCES } from '../../shared/sshAlgorithmDefaults.js'

const { config } = workerData

/** 
 * 发送消息到主线程，用于处理 SSH 连接事件
 * @param {object} m 消息
 */
function post(m) {
  parentPort.postMessage(m)
}

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
 * @param {string} cfg.algorithms.serverHostKey 服务器主机密钥算法
 * @param {string} cfg.algorithms.cipher 加密算法
 * @param {string} cfg.algorithms.hmac 消息认证码算法
 * @param {string} cfg.algorithms.compress 压缩算法
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
  stream: null,  // SSH 流
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
  })  // ssh2 的 hostVerifier 在 Worker 里，但 弹框必须在主进程（要 dialog 和 BrowserWindow），所以发消息到主线程
}

parentPort.on('message', (msg) => {  // 监听主线程发送的消息
  if (msg.type === 'HOST_VERIFY_RESULT') {
    const cb = verifyCallbacks.get(msg.reqId)
    verifyCallbacks.delete(msg.reqId)
    if (typeof cb === 'function') cb(!!msg.ok)
    return
  }
  if (msg.type === 'WRITE') {
    if (state.stream && !state.stream.destroyed) {
      const buf = Buffer.isBuffer(msg.data) ? msg.data : Buffer.from(msg.data)
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
    } catch (_) {}
    setTimeout(() => {
      try {
        state.conn?.end()
      } catch (_) {}
    }, 50)
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
  state.conn.shell({ term: 'xterm-256color' }, (err, stream) => {
    if (err) {
      try {
        state.conn.end()
      } catch (_) {}
      postFail(err.message)
      return
    }
    state.stream = stream
    stream.on('data', (data) => {  // 监听 SSH 流数据事件，参数为数据
      post({ type: 'OUTPUT', data: data.toString('binary') })
    })
    stream.stderr.on('data', (data) => {  // 监听 SSH 流错误数据事件，参数为数据
      post({ type: 'OUTPUT', data: data.toString('binary') })
    })
    stream.on('close', postClosed)  // 监听 SSH 流关闭事件，发送关闭消息
    state.conn.on('close', postClosed)  // 监听 SSH 连接关闭事件，发送关闭消息
    post({ type: 'READY' })
  })
})
state.conn.on('error', (err) => {  // 监听 SSH 连接错误事件，参数为错误对象
  postFail(err.message)
})

try {
  state.conn.connect(buildConnectConfig(config, hostVerifier))  // 连接 SSH 服务器，参数为连接配置、主机公钥校验器
} catch (e) {
  postFail(e.message)  // 发送失败消息
}
