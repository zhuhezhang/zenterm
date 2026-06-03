/** 在独立 Worker 中运行 ssh2 客户端，避免 SSH 握手（DH 等）阻塞 Electron 主进程事件循环导致界面卡死 */
import { parentPort, workerData } from 'worker_threads'
import { Client } from 'ssh2'
import type { Duplex } from 'node:stream'
import { bufferToBinaryWire } from '../lib/terminalEncodingService.js'
import { buildSshConnectConfig } from '../lib/sshConnectConfig.js'
import type { SshConnectConfig } from '../../shared/zterm-api.js'
import type { SshWorkerInboundMessage } from '../types/workerMessages.js'

if (!parentPort) throw new Error('worker_threads parentPort missing')
const port = parentPort

const { config } = workerData as { config: SshConnectConfig }

/** 主机公钥校验序列号 */
let verifySeq = 0
/** 主机公钥校验回调函数 */
const verifyCallbacks = new Map<number, (ok: boolean) => void>()

type SshShellStream = Duplex & {
  stderr: Duplex
  setWindow: (rows: number, cols: number) => void
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
 * @param key 主机公钥
 * @param callback 回调函数
 */
function hostVerifier(key: Buffer, callback: (ok: boolean) => void) {
  const raw = Buffer.isBuffer(key) ? key : Buffer.from(key)
  const reqId = ++verifySeq
  verifyCallbacks.set(reqId, callback)
  port.postMessage({  // 发送消息到主线程；ssh2 的 hostVerifier 在 Worker 里，但弹框必须在主进程（要 dialog 和 BrowserWindow）
    type: 'HOST_VERIFY',
    reqId,
    host: config.host,
    port: config.port || 22,
    keyBase64: raw.toString('base64'),
  })
}

port.on('message', (msg: SshWorkerInboundMessage) => {  // 监听来自主进程的消息
  if (msg.type === 'HOST_VERIFY_RESULT') {  // 主机公钥校验结果
    const reqId = Number(msg.reqId)
    const cb = verifyCallbacks.get(reqId)
    verifyCallbacks.delete(reqId)
    if (typeof cb === 'function') cb(!!msg.ok)
    return
  }
  if (msg.type === 'WRITE') {  // 写入数据
    if (state.stream && !state.stream.destroyed) {
      const buf = Buffer.isBuffer(msg.data)
        ? msg.data
        : Buffer.from(msg.data as string | ArrayLike<number>)
      state.stream.write(buf)
    }
    return
  }
  if (msg.type === 'RESIZE') {  // 调整窗口大小
    if (state.stream && !state.stream.destroyed) {
      state.stream.setWindow(msg.rows, msg.cols)
    }
    return
  }
  if (msg.type === 'DISCONNECT') {  // 断开连接
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
 * @param message 错误消息
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
conn.on('ready', () => {  // 连接准备就绪
  conn.shell({ term: 'xterm-256color' }, (err: Error | undefined, stream: SshShellStream) => {
    if (err) {
      try {
        conn.end()
      } catch {}
      postFail(err.message)
      return
    }
    state.stream = stream
    stream.on('data', (data: Buffer) => {  // 输出数据
      port.postMessage({ type: 'OUTPUT', data: bufferToBinaryWire(data) })
    })
    stream.stderr.on('data', (data: Buffer) => {  // 输出错误数据
      port.postMessage({ type: 'OUTPUT', data: bufferToBinaryWire(data) })
    })
    stream.on('close', postClosed)  // 关闭流
    conn.on('close', postClosed)  // 关闭连接
    port.postMessage({ type: 'READY' })
  })
})
conn.on('error', (...args: unknown[]) => {  // 连接错误
  const err = args[0]
  postFail(err instanceof Error ? err.message : String(err))
})

try {
  conn.connect(buildSshConnectConfig(config, hostVerifier))
} catch (e) {
  postFail(e instanceof Error ? e.message : String(e))
}
