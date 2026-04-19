let SerialPort
try {
  const serialport = require('serialport')
  SerialPort = serialport.SerialPort
} catch (e) {
  console.warn('serialport not available:', e.message)
}

/** 存储所有 Serial 会话信息的 Map，键为会话 ID，值为 SerialPort 实例 */
const serialSessions = new Map()

/**
 * 设置 Serial 相关的 IPC 处理函数，传入 ipcMain 和 mainWindow 以便在处理函数中使用 IPC 和窗口通信
 * @param {Electron.IpcMain} ipcMain Electron 的 IPC 主进程模块，用于监听和处理来自渲染进程的 IPC 消息
 * @param {Electron.BrowserWindow} mainWindow 主窗口实例，用于在处理函数中向渲染进程发送 IPC 消息
 */
function setupSerialHandlers(ipcMain, mainWindow) {
  ipcMain.handle('serial:listPorts', async () => {  // 监听渲染进程发送的列出串口请求
    if (!SerialPort) return { success: false, error: 'serialport module not available', ports: [] }
    try {
      const ports = await SerialPort.list()
      return { success: true, ports }
    } catch (e) {
      return { success: false, error: e.message, ports: [] }
    }
  })

  ipcMain.handle('serial:connect', async (_event, id, config) => {  // 监听渲染进程发送的 Serial 连接请求，传入会话 ID 和连接配置
    if (!SerialPort) return { success: false, error: 'serialport module not available' }

    return new Promise((resolve) => {
      const port = new SerialPort({
        path: config.path,  // 端口号/端口路径
        baudRate: config.baudRate || 9600,  // 波特率，默认9600
        dataBits: config.dataBits || 8,  // 数据位，默认8
        stopBits: config.stopBits || 1,  // 停止位，默认1
        parity: config.parity || 'none',  // 校验位，默认无
        autoOpen: false,  // 不自动打开，手动调用 port.open() 来打开连接，以便在打开时处理错误
      })

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

  ipcMain.on('serial:data', (_event, id, data) => {  // 监听来自渲染进程的数据，并写入串口
    const port = serialSessions.get(id)
    if (port && port.isOpen) {
      port.write(data)
    }
  })

  ipcMain.handle('serial:disconnect', async (_event, id) => {  // 监听 serial:disconnect，关闭端口并清理会话
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

module.exports = { setupSerialHandlers }  // 导出 setupSerialHandlers 函数，以便在 main.js 中引入并调用设置 Serial 相关的 IPC 处理函数
