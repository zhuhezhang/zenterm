import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import type { SerialPort as SerialPortClass } from 'serialport'

/** serialport `list()` 返回的端口项（与 @serialport/bindings-interface 的 PortInfo 一致） */
type SerialPortListEntry = Awaited<ReturnType<typeof SerialPortClass.list>>[number]
type SerialPortInstance = InstanceType<typeof SerialPortClass>
import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { sendToRenderer } from '../lib/mainWindowSend.js'
import { bufferToBinaryWire, encodeOutgoingTerminalData } from '../lib/terminalEncodingService.js'
import { ipcFail, ipcOk } from '../lib/ipcResponse.js'
import { translateMain } from '../i18n/translateMain.js'
import type { MainWindowGetter } from '../types/handlers.js'
import { isSerialPathInEnumeratedList } from '../../shared/isSerialPathInEnumeratedList.js'
import type { SerialConnectConfig } from '../../shared/zterm-api.js'

let SerialPort: typeof SerialPortClass | undefined
try {
  const serialport = await import('serialport')
  SerialPort = serialport.SerialPort
} catch (e) {
  console.warn('serialport not available:', e instanceof Error ? e.message : e)
}

/** 存储所有 Serial 会话信息的 Map，键为会话 ID，值为 SerialPort 实例 */
const serialSessions = new Map<string, SerialPortInstance>()

/**
 * 设置 Serial 相关的 IPC 处理函数
 */
function setupSerialHandlers(ipcMain: IpcMain, getMainWindow: MainWindowGetter) {
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

  ipcMain.handle('serial:connect', async (event: IpcMainInvokeEvent, id: string, config: SerialConnectConfig) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (!SerialPort) return ipcFail('serial.moduleUnavailable', true)
    const cfg = config

    let enumerated: SerialPortListEntry[]
    try {
      enumerated = await SerialPort.list()
    } catch {
      return ipcFail('serial.enumerateFailed', true)
    }
    if (!isSerialPathInEnumeratedList(cfg.path, enumerated)) {
      return ipcFail('serial.pathNotInList', true)
    }

    return new Promise((resolve) => {
      let port: SerialPortInstance
      try {
        port = new SerialPort({
          path: String(cfg.path),
          baudRate: (cfg.baudRate as number | undefined) || 9600,
          dataBits: (cfg.dataBits as number | undefined) || 8,
          stopBits: (cfg.stopBits as number | undefined) || 1,
          parity: (cfg.parity as string | undefined) || 'none',
          autoOpen: false,
        } as ConstructorParameters<typeof SerialPortClass>[0])
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
          sendToRenderer(getMainWindow, 'serial:output', id, bufferToBinaryWire(data))
        })

        port.on('close', () => {
          serialSessions.delete(id)
          sendToRenderer(getMainWindow, 'serial:closed', id)
        })

        port.on('error', (err: Error) => {
          sendToRenderer(
            getMainWindow,
            'serial:output',
            id,
            `\r\n${translateMain('serial.terminalErrorPrefix')} ${err.message}\r\n`,
          )
        })

        resolve(ipcOk())
      })
    })
  })

  ipcMain.on('serial:data', (event: IpcMainEvent, id: string, data: string, encoding?: string) => {
    if (!isTrustedIpcSender(event.sender)) return
    const port = serialSessions.get(id)
    if (port && port.isOpen) {
      port.write(encodeOutgoingTerminalData(data, encoding))
    }
  })

  ipcMain.handle('serial:disconnect', async (event: IpcMainInvokeEvent, id: string) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
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
