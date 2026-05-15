import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { setupSSHHandlers } from './handlers/ssh.js'
import { setupSFTPHandlers } from './handlers/sftp.js'
import { setupTelnetHandlers } from './handlers/telnet.js'
import { setupSerialHandlers } from './handlers/serial.js'
import { setupCredentialHandlers } from './handlers/credentials.js'
import { assertLogWriteDirectoryAllowed, validateLogWriteDirectory } from './lib/localPathPolicy.js'
import {
  setTrustedRendererWebContents,
  clearTrustedRendererWebContents,
  isTrustedIpcSender,
} from './lib/trustedSender.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged  // 兼容开发环境和生产环境的判断(通过环境变量和是否打包判读)
// const isDev = false  // 强制生产环境用于测试
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
      preload: path.join(__dirname, 'preload.cjs'),  // 预加载脚本，安全地暴露 IPC 接口
      contextIsolation: true, // 启用上下文隔离
      nodeIntegration: false, // 禁用 Node.js 集成
      enableRemoteModule: false, // 禁用 remote 模块
      sandbox: true, // 启用沙盒模式
      devTools: isDev, // 生产环境禁用开发者工具
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')  // 开发环境加载 Vite 开发服务器地址
    mainWindow.webContents.openDevTools()  // 开发环境自动打开开发者工具
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))  // 生产环境加载打包后的静态文件
  }

  setTrustedRendererWebContents(mainWindow.webContents)
  mainWindow.on('closed', () => clearTrustedRendererWebContents())

  // 监听渲染进程发送的窗口操作指令（最小化、最大化、关闭）
  ipcMain.on('window:minimize', (e) => {
    if (!isTrustedIpcSender(e.sender)) return
    mainWindow.minimize()
  })
  ipcMain.on('window:maximize', (e) => {
    if (!isTrustedIpcSender(e.sender)) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.on('window:close', (e) => {
    if (!isTrustedIpcSender(e.sender)) return
    mainWindow.close()
  })
  ipcMain.handle('window:isMaximized', (e) => {
    if (!isTrustedIpcSender(e.sender)) return false
    return mainWindow.isMaximized()
  })

  ipcMain.on('window:setBackgroundColor', (e, hex) => {  // 监听渲染进程发送的窗口背景色设置请求，设置窗口背景色
    if (!isTrustedIpcSender(e.sender)) return
    if (!mainWindow || typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) return  // 如果窗口不存在或 hex 不是有效的十六进制颜色，则返回
    try {
      mainWindow.setBackgroundColor(hex)
    } catch (_) {}
  })

  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized', true))  // 当窗口被最大化时，向渲染进程发送 window:maximized 消息
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized', false))


  ipcMain.on('app:getDownloadsPath', (e) => {  // 获取下载目录路径
    if (!isTrustedIpcSender(e.sender)) {
      e.returnValue = ''
      return
    }
    e.returnValue = app.getPath('downloads')
  })

  ipcMain.handle('app:chooseDirectory', async (event) => {  // 选择日志保存目录
    if (!isTrustedIpcSender(event.sender)) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择日志保存目录',
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('app:validateLogDirectory', (event, dir) => {  // 校验日志目录是否在允许的用户目录范围内（与 log:write 一致）
    if (!isTrustedIpcSender(event.sender)) return { ok: false, message: '无效的请求。' }
    const s = dir == null ? '' : String(dir).trim()
    if (!s) return { ok: true }
    return validateLogWriteDirectory(s)
  })

  ipcMain.on('log:write', (e, logDir, logFileName, data) => {  // 写入日志
    try {
      if (!isTrustedIpcSender(e.sender)) return
      if (!logDir) return
      assertLogWriteDirectoryAllowed(logDir)
      fs.mkdirSync(logDir, { recursive: true })  // 确保日志目录存在（recursive可以创建多级目录）
      const safeFileName = String(logFileName).replace(/[\/\\:*?"\u003c\u003e|\x00]/g, '_').trim() || 'session'  // 只过滤真正的文件名非法字符，保留汉字等 Unicode 字符
      const filePath = path.join(logDir, `${safeFileName}.log`)
      fs.writeFileSync(filePath, data, 'utf8')
    } catch (err) {
      console.error('log:write error', err)
    }
  })

  ipcMain.on('log:append', (e, logDir, logFileName, data) => {  // 追加写入会话日志（与 log:write 相同路径校验），用于保留已滚出 xterm 缓冲区的历史输出
    try {
      if (!isTrustedIpcSender(e.sender)) return
      if (!logDir || data == null || data === '') return
      assertLogWriteDirectoryAllowed(logDir)
      fs.mkdirSync(logDir, { recursive: true })
      const safeFileName = String(logFileName).replace(/[\/\\:*?"\u003c\u003e|\x00]/g, '_').trim() || 'session'
      const filePath = path.join(logDir, `${safeFileName}.log`)
      fs.appendFileSync(filePath, String(data), 'utf8')
    } catch (err) {
      console.error('log:append error', err)
    }
  })
}

app.whenReady().then(async () => {
  createWindow()
  setupSSHHandlers(ipcMain, mainWindow)  // 设置 SSH 相关的 IPC 处理函数，传入 ipcMain 和 mainWindow 以便在处理函数中使用 IPC 和窗口通信
  setupSFTPHandlers(ipcMain, mainWindow)
  setupTelnetHandlers(ipcMain, mainWindow)
  setupSerialHandlers(ipcMain, mainWindow)
  setupCredentialHandlers(ipcMain)

  app.on('activate', () => {  // macOS 机制：点击 Dock 图标时若无窗口则重新创建窗口
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()  // 除 macOS 外，所有窗口关闭时退出应用
})
