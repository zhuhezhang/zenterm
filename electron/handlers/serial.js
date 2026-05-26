import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { stringToTerminalBytes } from '../lib/encodeTerminalWrite.js'
import { ipcFail, ipcOk } from '../lib/ipcResponse.js'
import { translateMain } from '../i18n/translateMain.js'

let SerialPort
try {
  const serialport = await import('serialport')
  SerialPort = serialport.SerialPort
} catch (e) {
  console.warn('serialport not available:', e.message)
}

/** 存储所有 Serial 会话信息的 Map，键为会话 ID，值为 SerialPort 实例 */
const serialSessions = new Map()

/**
 * 请求的路径是否在当前枚举到的串口列表中（降低任意路径打开设备的风险）
 * @param {string} requestedPath 请求的路径
 * @param {Array<{ path?: string }>} ports SerialPort.list() 结果（如[{ path: '/dev/tty.usbserial-A1234567' }]）
 */
function isSerialPathInEnumeratedList(requestedPath, ports) {
  const req = String(requestedPath ?? '').trim()
  if (!req) return false
  const paths = ports.map((p) => p?.path).filter(Boolean)
  if (process.platform === 'win32') {
    const rl = req.toLowerCase()
    return paths.some((p) => p.toLowerCase() === rl)
  }
  return paths.includes(req)
}

/**
 * 设置 Serial 相关的 IPC 处理函数，传入 ipcMain 和 mainWindow 以便在处理函数中使用 IPC 和窗口通信
 * @param {Electron.IpcMain} ipcMain Electron 的 IPC 主进程模块，用于监听和处理来自渲染进程的 IPC 消息
 * @param {Electron.BrowserWindow} mainWindow 主窗口实例，用于在处理函数中向渲染进程发送 IPC 消息
 */
function setupSerialHandlers(ipcMain, mainWindow) {
  ipcMain.handle('serial:listPorts', async (event) => {  // 获取可用串口列表
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true, undefined, { ports: [] })
    if (!SerialPort) return ipcFail('serial.moduleUnavailable', true, undefined, { ports: [] })
    try {
      const ports = await SerialPort.list()
      return ipcOk({ ports })
    } catch (e) {
      return ipcFail(e.message, false, undefined, { ports: [] })
    }
  })

  ipcMain.handle('serial:connect', async (event, id, config) => {  // 连接串口，参数为会话ID、配置对象，返回连接结果
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (!SerialPort) return ipcFail('serial.moduleUnavailable', true)

    let enumerated
    try {
      enumerated = await SerialPort.list()
    } catch (e) {
      return ipcFail('serial.enumerateFailed', true)
    }
    if (!isSerialPathInEnumeratedList(config?.path, enumerated)) {
      return ipcFail('serial.pathNotInList', true)
    }

    return new Promise((resolve, _reject) => {
      let port
      try {
        port = new SerialPort({
          path: config.path,  // 端口号/端口路径
          baudRate: config.baudRate || 9600,  // 波特率，默认9600
          dataBits: config.dataBits || 8,  // 数据位，默认8
          stopBits: config.stopBits || 1,  // 停止位，默认1
          parity: config.parity || 'none',  // 校验位，默认无
          autoOpen: false,  // 不自动打开，手动调用 port.open() 来打开连接，以便在打开时处理错误
        })
      } catch (e) {
        return resolve(ipcFail(e.message, false))
      }

      port.open((err) => {  // 打开串口连接，回调接收错误信息 err
        if (err) return resolve(ipcFail(err.message, false))

        serialSessions.set(id, port)

        port.on('data', (data) => {  // 监听接收串口输出信息，并发送到渲染进程
          mainWindow.webContents.send('serial:output', id, data.toString('binary'))
        })

        port.on('close', () => {  // 监听端口关闭，清理会话并通知渲染进程
          serialSessions.delete(id)
          mainWindow.webContents.send('serial:closed', id)
        })

        port.on('error', (err) => {  // 监听错误，发送错误消息到渲染进程
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

  ipcMain.on('serial:data', (event, id, data, encoding) => {  // 发送串口数据，参数为会话ID、数据、编码，返回发送结果
    if (!isTrustedIpcSender(event.sender)) return
    const port = serialSessions.get(id)
    if (port && port.isOpen) {
      const buf = typeof data === 'string' ? stringToTerminalBytes(data, encoding) : data
      port.write(buf)
    }
  })

  ipcMain.handle('serial:disconnect', async (event, id) => {  // 断开串口连接，参数为会话ID，返回断开结果
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const port = serialSessions.get(id)
    if (port) {
      try {
        if (port.isOpen) port.close()
      } catch (e) {}
      serialSessions.delete(id)
    }
    return ipcOk()
  })
}

export { setupSerialHandlers }
