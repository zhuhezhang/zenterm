import net from 'net'
import type { BrowserWindow, IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { ipcFail, ipcOk } from '../lib/ipcResponse.js'
import { bufferToBinaryWire, encodeOutgoingTerminalData } from '../lib/terminalEncodingService.js'

/** 存储所有 Telnet 会话信息的 Map，键为会话 ID，值为 net.Socket 实例 */
const telnetSessions = new Map<string, net.Socket>()

// Telnet 协议常量，用于选项协商（IAC: Interpret As Command）
const TELNET_IAC = 255
const TELNET_DO = 253
const TELNET_DONT = 254
const TELNET_WILL = 251
const TELNET_WONT = 252
const TELNET_SB = 250
const TELNET_SE = 240

/** 未完成的 Telnet 序列与跨 TCP 分片拼接；socket 销毁后由 WeakMap 与 close 清理 */
const telnetInboundPending = new WeakMap<net.Socket, Buffer>()
const TELNET_MAX_PENDING = 65536

/**
 * 从下行流中去掉 Telnet 命令，保留终端数据；支持跨 chunk、IAC IAC 字面 0xFF、SB…IAC SE
 */
function stripTelnetStream(socket: net.Socket, chunk: Buffer) {
  let pending = telnetInboundPending.get(socket)
  if (pending?.length && pending.length + chunk.length > TELNET_MAX_PENDING) {
    telnetInboundPending.delete(socket)
    pending = undefined
  }
  const buf = pending?.length ? Buffer.concat([pending, chunk]) : Buffer.from(chunk)

  const output: number[] = []
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

function clearTelnetParserState(socket: net.Socket) {
  telnetInboundPending.delete(socket)
}

/**
 * 设置 Telnet 相关的 IPC 处理函数
 */
function setupTelnetHandlers(ipcMain: IpcMain, mainWindow: BrowserWindow) {
  ipcMain.handle('telnet:connect', async (event: IpcMainInvokeEvent, id: unknown, config: unknown) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (typeof id !== 'string') return ipcFail('app.invalidRequest', true)
    if (!config || typeof config !== 'object') return ipcFail('app.invalidRequest', true)
    const cfg = config as Record<string, unknown>

    return new Promise((resolve) => {
      const socket = new net.Socket()
      let connected = false
      let settled = false
      const resolveOnce = (payload: ReturnType<typeof ipcOk> | ReturnType<typeof ipcFail>) => {
        if (settled) return
        settled = true
        resolve(payload)
      }
      const timeout = setTimeout(() => {
        socket.destroy()
        resolveOnce(ipcFail('telnet.connectionTimeout', true))
      }, 10000)

      socket.connect(Number(cfg.port) || 23, String(cfg.host), () => {
        clearTimeout(timeout)
        connected = true
        telnetSessions.set(id, socket)
        resolveOnce(ipcOk())
      })

      socket.on('data', (data: Buffer) => {
        const processed = stripTelnetStream(socket, data)
        if (processed.length > 0) {
          mainWindow.webContents.send('telnet:output', id, bufferToBinaryWire(processed))
        }
      })

      socket.on('close', () => {
        clearTelnetParserState(socket)
        telnetSessions.delete(id)
        mainWindow.webContents.send('telnet:closed', id)
      })

      socket.on('error', (err: Error) => {
        clearTimeout(timeout)
        clearTelnetParserState(socket)
        telnetSessions.delete(id)
        if (!connected) {
          resolveOnce(ipcFail(err.message, false))
        }
      })
    })
  })

  ipcMain.on('telnet:data', (event: IpcMainEvent, id: unknown, data: unknown, encoding: unknown) => {
    if (!isTrustedIpcSender(event.sender)) return
    if (typeof id !== 'string') return
    const socket = telnetSessions.get(id)
    if (socket) {
      socket.write(encodeOutgoingTerminalData(data, typeof encoding === 'string' ? encoding : undefined))
    }
  })

  ipcMain.handle('telnet:disconnect', async (event: IpcMainInvokeEvent, id: unknown) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (typeof id !== 'string') return ipcOk()
    const socket = telnetSessions.get(id)
    if (socket) {
      try {
        clearTelnetParserState(socket)
        socket.destroy()
      } catch {}
      telnetSessions.delete(id)
    }
    return ipcOk()
  })
}

export { setupTelnetHandlers }
