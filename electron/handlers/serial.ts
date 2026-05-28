import type { BrowserWindow, IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import type { SerialPort as SerialPortClass, SerialPortInfo } from 'serialport'
import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { bufferToBinaryWire, encodeOutgoingTerminalData } from '../lib/terminalEncodingService.js'
import { ipcFail, ipcOk } from '../lib/ipcResponse.js'
import { translateMain } from '../i18n/translateMain.js'

let SerialPort: typeof SerialPortClass | undefined
try {
  const serialport = await import('serialport')
  SerialPort = serialport.SerialPort
} catch (e) {
  console.warn('serialport not available:', e instanceof Error ? e.message : e)
}

/** 存储所有 Serial 会话信息的 Map，键为会话 ID，值为 SerialPort 实例 */
const serialSessions = new Map<string, SerialPortClass>()

/**
 * 请求的路径是否在当前枚举到的串口列表中（降低任意路径打开设备的风险）
 */
function isSerialPathInEnumeratedList(requestedPath: unknown, ports: SerialPortInfo[]) {
  const req = String(requestedPath ?? '').trim()
  if (!req) return false
  const paths = ports.map((p) => p?.path).filter(Boolean) as string[]
  if (process.platform === 'win32') {
    const rl = req.toLowerCase()
    return paths.some((p) => p.toLowerCase() === rl)
  }
  return paths.includes(req)
}

/**
 * 设置 Serial 相关的 IPC 处理函数
 */
function setupSerialHandlers(ipcMain: IpcMain, mainWindow: BrowserWindow) {
  ipcMain.handle('serial:listPorts', async (event: IpcMainInvokeEvent) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true, undefined, { ports: [] })
    if (!SerialPort) return ipcFail('serial.moduleUnavailable', true, undefined, { ports: [] })
    try {
      const ports = await SerialPort.list()
      return ipcOk({ ports })
    } catch (e) {
      return ipcFail(e instanceof Error ? e.message : String(e), false, undefined, { ports: [] })
    }
  })

  ipcMain.handle('serial:connect', async (event: IpcMainInvokeEvent, id: unknown, config: unknown) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (!SerialPort) return ipcFail('serial.moduleUnavailable', true)
    if (!id || typeof id !== 'string') return ipcFail('app.invalidRequest', true)
    if (!config || typeof config !== 'object') return ipcFail('app.invalidRequest', true)
    const cfg = config as Record<string, unknown>

    let enumerated: SerialPortInfo[]
    try {
      enumerated = await SerialPort.list()
    } catch {
      return ipcFail('serial.enumerateFailed', true)
    }
    if (!isSerialPathInEnumeratedList(cfg.path, enumerated)) {
      return ipcFail('serial.pathNotInList', true)
    }

    return new Promise((resolve) => {
      let port: SerialPortClass
      try {
        port = new SerialPort({
          path: cfg.path,
          baudRate: (cfg.baudRate as number | undefined) || 9600,
          dataBits: (cfg.dataBits as number | undefined) || 8,
          stopBits: (cfg.stopBits as number | undefined) || 1,
          parity: (cfg.parity as string | undefined) || 'none',
          autoOpen: false,
        })
      } catch (e) {
        resolve(ipcFail(e instanceof Error ? e.message : String(e), false))
        return
      }

      port.open((err) => {
        if (err) {
          resolve(ipcFail(err.message, false))
          return
        }

        serialSessions.set(id, port)

        port.on('data', (data: Buffer) => {
          mainWindow.webContents.send('serial:output', id, bufferToBinaryWire(data))
        })

        port.on('close', () => {
          serialSessions.delete(id)
          mainWindow.webContents.send('serial:closed', id)
        })

        port.on('error', (err: Error) => {
          mainWindow.webContents.send(
            'serial:output',
            id,
            `\r\n${translateMain('serial.terminalErrorPrefix')} ${err.message}\r\n`,
          )
        })

        resolve(ipcOk())
      })
    })
  })

  ipcMain.on('serial:data', (event: IpcMainEvent, id: unknown, data: unknown, encoding: unknown) => {
    if (!isTrustedIpcSender(event.sender)) return
    if (typeof id !== 'string') return
    const port = serialSessions.get(id)
    if (port && port.isOpen) {
      port.write(encodeOutgoingTerminalData(data, typeof encoding === 'string' ? encoding : undefined))
    }
  })

  ipcMain.handle('serial:disconnect', async (event: IpcMainInvokeEvent, id: unknown) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (typeof id !== 'string') return ipcOk()
    const port = serialSessions.get(id)
    if (port) {
      try {
        if (port.isOpen) port.close()
      } catch {}
      serialSessions.delete(id)
    }
    return ipcOk()
  })
}

export { setupSerialHandlers }
