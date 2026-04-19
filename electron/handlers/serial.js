let SerialPort, ReadlineParser
try {
  const serialport = require('serialport')
  SerialPort = serialport.SerialPort
  ReadlineParser = require('@serialport/parser-readline').ReadlineParser
} catch (e) {
  console.warn('serialport not available:', e.message)
}

const serialSessions = new Map()

function setupSerialHandlers(ipcMain, mainWindow) {
  ipcMain.handle('serial:listPorts', async () => {
    if (!SerialPort) return { success: false, error: 'serialport module not available', ports: [] }
    try {
      const ports = await SerialPort.list()
      return { success: true, ports }
    } catch (e) {
      return { success: false, error: e.message, ports: [] }
    }
  })

  ipcMain.handle('serial:connect', async (_event, id, config) => {
    if (!SerialPort) return { success: false, error: 'serialport module not available' }

    return new Promise((resolve) => {
      const port = new SerialPort({
        path: config.path,
        baudRate: config.baudRate || 9600,
        dataBits: config.dataBits || 8,
        stopBits: config.stopBits || 1,
        parity: config.parity || 'none',
        autoOpen: false,
      })

      port.open((err) => {
        if (err) return resolve({ success: false, error: err.message })

        serialSessions.set(id, port)

        port.on('data', (data) => {
          mainWindow.webContents.send('serial:output', id, data.toString('binary'))
        })

        port.on('close', () => {
          serialSessions.delete(id)
          mainWindow.webContents.send('serial:closed', id)
        })

        port.on('error', (err) => {
          mainWindow.webContents.send('serial:output', id, `\r\n[ERROR] ${err.message}\r\n`)
        })

        resolve({ success: true })
      })
    })
  })

  ipcMain.on('serial:data', (_event, id, data) => {
    const port = serialSessions.get(id)
    if (port && port.isOpen) {
      port.write(data)
    }
  })

  ipcMain.handle('serial:disconnect', async (_event, id) => {
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
