const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { setupSSHHandlers } = require('./handlers/ssh')
const { setupSFTPHandlers } = require('./handlers/sftp')
const { setupTelnetHandlers } = require('./handlers/telnet')
const { setupSerialHandlers } = require('./handlers/serial')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged  // 兼容开发环境和生产环境的判断(通过环境变量和是否打包判读)
let mainWindow

/** 创建主窗口，设置窗口属性和事件处理 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,  // 无系统边框，自定义标题栏
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 14 },  // macOS 左上角按钮位置调整
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),  // 预加载脚本，安全地暴露 IPC 接口
      nodeIntegration: false,  // 渲染进程禁用 Node.js 直接访问
      contextIsolation: true,  // 启用上下文隔离，增强安全性
      sandbox: false,  // 关闭沙箱模式（允许 preload 使用 Node）
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')  // 开发环境加载 Vite 开发服务器地址
    mainWindow.webContents.openDevTools()  // 开发环境自动打开开发者工具
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))  // 生产环境加载打包后的静态文件
  }

  // 监听渲染进程发送的窗口操作指令（最小化、最大化、关闭）
  ipcMain.on('window:minimize', () => mainWindow.minimize())  // 监听渲染进程通过通道window:minimize传入的最小化指令
  ipcMain.on('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })
  ipcMain.on('window:close', () => mainWindow.close())
  // 每当渲染进程通过 window:isMaximized 通道发送 ipcRender.invoke 消息时，该函数就会作为回调函数来处理这个消息，然后将返回值送回到最初的 invoke 调用
  ipcMain.handle('window:isMaximized', () => mainWindow.isMaximized())

  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized', true))  // 当窗口被最大化时，向渲染进程发送 window:maximized 消息
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized', false))


  ipcMain.on('app:getDownloadsPath', (e) => {
    e.returnValue = app.getPath('downloads')  // 同步返回下载目录路径
  })

  ipcMain.handle('app:chooseDirectory', async () => {  // 弹出目录选择框，返回选中的目录路径
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择日志保存目录',
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.on('log:write', (_e, logDir, logFileName, data) => {  // 日志写入：参数为日志路径、日志文件名、日志内容
    try {
      if (!logDir) return
      fs.mkdirSync(logDir, { recursive: true })  // 确保日志目录存在（recursive可以创建多级目录）
      const safeFileName = String(logFileName).replace(/[\/\\:*?"\u003c\u003e|\x00]/g, '_').trim() || 'session'  // 只过滤真正的文件名非法字符，保留汉字等 Unicode 字符
      const filePath = path.join(logDir, `${safeFileName}.log`)
      fs.writeFileSync(filePath, data, 'utf8')
    } catch (err) {
      console.error('log:write error', err)
    }
  })
}

app.whenReady().then(async () => {
  createWindow()
  setupSSHHandlers(ipcMain, mainWindow)  // 设置 SSH 相关的 IPC 处理函数，传入 ipcMain 和 mainWindow 以便在处理函数中使用 IPC 和窗口通信
  setupSFTPHandlers(ipcMain, mainWindow)
  setupTelnetHandlers(ipcMain, mainWindow)
  setupSerialHandlers(ipcMain, mainWindow)

  app.on('activate', () => {  // macOS 机制：点击 Dock 图标时若无窗口则重新创建窗口
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()  // 除 macOS 外，所有窗口关闭时退出应用
})
