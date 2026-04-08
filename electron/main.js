const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { setupSSHHandlers } = require('./handlers/ssh')
const { setupSFTPHandlers } = require('./handlers/sftp')
const { setupTelnetHandlers } = require('./handlers/telnet')
const { setupSerialHandlers } = require('./handlers/serial')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    // mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Window control IPC
  ipcMain.on('window:minimize', () => mainWindow.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })
  ipcMain.on('window:close', () => mainWindow.close())
  ipcMain.handle('window:isMaximized', () => mainWindow.isMaximized())

  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized', false))

  // 系统路径
  ipcMain.on('app:getDownloadsPath', (e) => {
    e.returnValue = app.getPath('downloads')
  })
  ipcMain.handle('app:chooseDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择日志保存目录',
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // 日志写入
  ipcMain.on('log:write', (e, logDir, sessionId, data) => {
    try {
      if (!logDir) return
      fs.mkdirSync(logDir, { recursive: true })
      // 只过滤真正的文件名非法字符，保留汉字等 Unicode 字符
      const safeId = String(sessionId).replace(/[\/\\:*?"\u003c\u003e|\x00]/g, '_').trim() || 'session'
      const filePath = path.join(logDir, `${safeId}.log`)
      fs.appendFileSync(filePath, data, 'utf8')
    } catch (err) {
      console.error('log:write error', err)
    }
  })
}

app.whenReady().then(() => {
  createWindow()
  setupSSHHandlers(ipcMain, mainWindow)
  setupSFTPHandlers(ipcMain, mainWindow)
  setupTelnetHandlers(ipcMain, mainWindow)
  setupSerialHandlers(ipcMain, mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
