import { isTrustedIpcSender, IPC_UNAUTHORIZED } from '../lib/trustedSender.js'

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
 * @param {string} requestedPath
 * @param {Array<{ path?: string }>} ports SerialPort.list() 结果
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
  ipcMain.handle('serial:listPorts', async (event) => {
    if (!isTrustedIpcSender(event.sender)) return { success: false, error: IPC_UNAUTHORIZED.error, ports: [] }
    if (!SerialPort) return { success: false, error: 'serialport module not available', ports: [] }
    try {
      const ports = await SerialPort.list()
      return { success: true, ports }
    } catch (e) {
      return { success: false, error: e.message, ports: [] }
    }
  })

  ipcMain.handle('serial:connect', async (event, id, config) => {
    if (!isTrustedIpcSender(event.sender)) return IPC_UNAUTHORIZED
    if (!SerialPort) return { success: false, error: 'serialport module not available' }

    let enumerated
    try {
      enumerated = await SerialPort.list()
    } catch (e) {
      return { success: false, error: e.message || '无法枚举串口设备' }
    }
    if (!isSerialPathInEnumeratedList(config?.path, enumerated)) {
      return {
        success: false,
        error:
          '串口路径必须是当前系统枚举到的设备。请在连接对话框中刷新或重新打开串口页签后，从列表中选择设备路径。',
      }
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
        return resolve({ success: false, error: e.message })
      }

      port.open((err) => {  // 打开串口连接，回调接收错误信息 err
        if (err) return resolve({ success: false, error: err.message })

        serialSessions.set(id, port)

        port.on('data', (data) => {  // 监听接收串口输出信息，并发送到渲染进程
          mainWindow.webContents.send('serial:output', id, data.toString('binary'))
        })

        port.on('close', () => {  // 监听端口关闭，清理会话并通知渲染进程
          serialSessions.delete(id)
          mainWindow.webContents.send('serial:closed', id)
        })

        port.on('error', (err) => {  // 监听错误，发送错误消息到渲染进程
          mainWindow.webContents.send('serial:output', id, `\r\n[ERROR] ${err.message}\r\n`)
        })

        resolve({ success: true })
      })
    })
  })

  ipcMain.on('serial:data', (event, id, data) => {
    if (!isTrustedIpcSender(event.sender)) return
    const port = serialSessions.get(id)
    if (port && port.isOpen) {
      port.write(data)
    }
  })

  ipcMain.handle('serial:disconnect', async (event, id) => {
    if (!isTrustedIpcSender(event.sender)) return IPC_UNAUTHORIZED
    const port = serialSessions.get(id)
    if (port) {
      try {
        if (port.isOpen) port.close()
      } catch (e) {}
      serialSessions.delete(id)
    }
    return { success: true }
  })
}

export { setupSerialHandlers }
