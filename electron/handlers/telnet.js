import net from 'net'
import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { ipcFail, ipcFailRaw, ipcOk } from '../../shared/ipcResponse.js'
import { stringToTerminalBytes } from '../lib/encodeTerminalWrite.js'

/** 存储所有 Telnet 会话信息的 Map，键为会话 ID，值为 net.Socket 实例 */
const telnetSessions = new Map()

// Telnet 协议常量，用于选项协商（IAC: Interpret As Command）
const TELNET_IAC = 255
const TELNET_DO = 253
const TELNET_DONT = 254
const TELNET_WILL = 251
const TELNET_WONT = 252
const TELNET_SB = 250
const TELNET_SE = 240

/** 未完成的 Telnet 序列与跨 TCP 分片拼接；socket 销毁后由 WeakMap 与 close 清理 */
const telnetInboundPending = new WeakMap()
const TELNET_MAX_PENDING = 65536

/**
 * 从下行流中去掉 Telnet 命令，保留终端数据；支持跨 chunk、IAC IAC 字面 0xFF、SB…IAC SE
 * @param {import('net').Socket} socket Telnet 会话的 socket 实例
 * @param {Buffer} chunk 下行流数据
 * @returns {Buffer} 处理后的数据
 */
function stripTelnetStream(socket, chunk) {
  let pending = telnetInboundPending.get(socket)
  if (pending?.length && pending.length + chunk.length > TELNET_MAX_PENDING) {
    telnetInboundPending.delete(socket)
    pending = undefined
  }
  const buf = pending?.length ? Buffer.concat([pending, chunk]) : Buffer.from(chunk)

  const output = []
  let i = 0
  const len = buf.length

  while (i < len) {
    if (buf[i] !== TELNET_IAC) {
      output.push(buf[i])
      i++
      continue
    }
    if (i + 1 >= len) break

    const cmd = buf[i + 1]
    if (cmd === TELNET_IAC) {
      output.push(TELNET_IAC)
      i += 2
      continue
    }
    if (cmd === TELNET_DO || cmd === TELNET_DONT || cmd === TELNET_WILL || cmd === TELNET_WONT) {
      if (i + 2 >= len) break
      i += 3
      continue
    }
    if (cmd === TELNET_SB) {
      if (i + 3 > len) break
      let j = i + 3
      let closed = false
      while (j < len) {
        if (buf[j] === TELNET_IAC) {
          if (j + 1 >= len) break
          if (buf[j + 1] === TELNET_SE) {
            j += 2
            closed = true
            break
          }
          if (buf[j + 1] === TELNET_IAC) {
            j += 2
            continue
          }
          j += 2
          continue
        }
        j++
      }
      if (!closed) break
      i = j
      continue
    }
    i += 2
  }

  if (i < len) telnetInboundPending.set(socket, buf.subarray(i))
  else telnetInboundPending.delete(socket)

  return Buffer.from(output)
}

/** 
 * 清除 Telnet 解析器状态 
 * @param {import('net').Socket} socket Telnet 会话的 socket 实例
 */
function clearTelnetParserState(socket) {
  telnetInboundPending.delete(socket)
}

/**
 * 设置 Telnet 相关的 IPC 处理函数，传入 ipcMain 和 mainWindow 以便在处理函数中使用 IPC 和窗口通信
 * @param {Electron.IpcMain} ipcMain Electron 的 IPC 主进程模块，用于监听和处理来自渲染进程的 IPC 消息
 * @param {Electron.BrowserWindow} mainWindow 主窗口实例，用于在处理函数中向渲染进程发送 IPC 消息
 */
function setupTelnetHandlers(ipcMain, mainWindow) {
  ipcMain.handle('telnet:connect', async (event, id, config) => {  // 连接 Telnet，参数为会话ID、配置对象，返回连接结果
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized')
    return new Promise((resolve, _reject) => {
      const socket = new net.Socket()
      let connected = false
      let settled = false
      const resolveOnce = (payload) => {  // 确保只解析一次 Promise，避免重复解析
        if (settled) return
        settled = true
        resolve(payload)
      }
      const timeout = setTimeout(() => {  // 连接超时（10s）处理，销毁 socket 并返回错误信息
        socket.destroy()
        resolveOnce(ipcFail('telnet.connectionTimeout'))
      }, 10000)

      socket.connect(config.port || 23, config.host, () => {  // 连接到主机和端口（默认 23），成功后存储会话并解析 Promise
        clearTimeout(timeout)  // 连接成功，清除超时定时器
        connected = true
        telnetSessions.set(id, socket)
        resolveOnce(ipcOk())
      })

      socket.on('data', (data) => {  // 监听接收数据，去掉 Telnet 命令，保留终端数据，并发送到渲染进程
        const processed = stripTelnetStream(socket, data)
        if (processed.length > 0) {
          mainWindow.webContents.send('telnet:output', id, processed.toString('binary'))
        }
      })

      socket.on('close', () => {  // 监听连接关闭，清除解析器状态并通知渲染进程
        clearTelnetParserState(socket)
        telnetSessions.delete(id)
        mainWindow.webContents.send('telnet:closed', id)
      })

      socket.on('error', (err) => {  // 监听错误：未连上时结束 Promise；已连上时勿发 telnet:closed（close 仍会触发并统一通知，避免重复「连接已关闭」）
        clearTimeout(timeout)
        clearTelnetParserState(socket)
        telnetSessions.delete(id)
        if (!connected) {
          resolveOnce(ipcFailRaw(err.message))
        }
      })
    })
  })

  ipcMain.on('telnet:data', (event, id, data, encoding) => {  // 发送 Telnet 数据，参数为会话ID、数据、编码，返回发送结果
    if (!isTrustedIpcSender(event.sender)) return
    const socket = telnetSessions.get(id)
    if (socket) {
      const buf = typeof data === 'string' ? stringToTerminalBytes(data, encoding) : data
      socket.write(buf)
    }
  })

  ipcMain.handle('telnet:disconnect', async (event, id) => {  // 断开 Telnet 连接，参数为会话ID，返回断开结果
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized')
    const socket = telnetSessions.get(id)
    if (socket) {
      try {
        clearTelnetParserState(socket)
        socket.destroy()
      } catch (e) {}
      telnetSessions.delete(id)
    }
    return ipcOk()
  })
}

export { setupTelnetHandlers }
