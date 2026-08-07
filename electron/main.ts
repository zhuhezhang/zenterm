import { app, BrowserWindow, ipcMain, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { setupSSHHandlers } from './handlers/ssh.js'  // import 里的路径是给「编译后 Node 运行时」看的，不是给编辑器里源码文件名看的。写 .js 是 TypeScript ESM 的规范要求，编译后 ssh.js 就会出现在 dist-electron/ 里
import { setupSFTPHandlers } from './handlers/sftp.js'
import { setupTelnetHandlers } from './handlers/telnet.js'
import { setupSerialHandlers } from './handlers/serial.js'
import { setupLocalHandlers } from './handlers/local.js'
import { setupCredentialHandlers } from './handlers/credentials.js'
import { setupWindowHandlers, attachWindowMaximizeEvents, attachZoomWheelHandler } from './handlers/window.js'
import { setupAppHandlers } from './handlers/app.js'
import { setupLogHandlers } from './handlers/log.js'
import { setTrustedRendererWebContents, clearTrustedRendererWebContents } from './lib/trustedSender.js'

/** 当前文件的目录路径 */
const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** 兼容开发环境和生产环境的判断(通过环境变量和是否打包判读) */
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

/** 开发环境窗口 / 任务栏图标；打包后由 electron-builder 写入应用包的路径 */
const appIconPath = path.join(__dirname, '../../build/icon.png')

// const isDev = false  // 强制生产环境用于测试

/** 开发环境窗口 / 任务栏图标；打包后由 electron-builder 写入应用包 */
function resolveAppIcon() {
  if (!fs.existsSync(appIconPath)) return undefined
  const image = nativeImage.createFromPath(appIconPath)
  return image.isEmpty() ? undefined : image
}

let mainWindow: BrowserWindow | undefined
const getMainWindow = () => mainWindow

let ipcHandlersRegistered = false

/** 所有 IPC handler 只注册一次，避免 macOS 重建窗口时重复绑定 */
function registerIpcHandlersOnce() {
  if (ipcHandlersRegistered) return
  ipcHandlersRegistered = true
  setupWindowHandlers(ipcMain, getMainWindow)  // 设置窗口处理程序
  setupAppHandlers(ipcMain, getMainWindow)  // 设置应用程序处理程序
  setupLogHandlers(ipcMain)  // 设置日志处理程序
  setupSSHHandlers(ipcMain, getMainWindow)  // 设置 SSH 相关的 IPC 处理函数
  setupSFTPHandlers(ipcMain, getMainWindow)  // 设置 SFTP 相关的 IPC 处理函数
  setupTelnetHandlers(ipcMain, getMainWindow)  // 设置 Telnet 相关的 IPC 处理函数
  setupSerialHandlers(ipcMain, getMainWindow)  // 设置 Serial 相关的 IPC 处理函数
  setupLocalHandlers(ipcMain, getMainWindow)  // 设置 Local Shell 相关的 IPC 处理函数
  setupCredentialHandlers(ipcMain)  // 设置凭据处理程序
}

/** 创建主窗口，设置窗口属性和事件处理 */
function createWindow() {
  const icon = resolveAppIcon()
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    center: true,
    ...(icon ? { icon } : {}),
    frame: false,  // 无系统边框，自定义标题栏
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 14 },  // macOS 左上角按钮位置调整
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),  // sandbox preload 须为 CJS（esbuild 输出）
      contextIsolation: true, // 启用上下文隔离
      nodeIntegration: false, // 禁用 Node.js 集成
      sandbox: true, // 启用沙盒模式
      devTools: isDev, // 生产环境禁用开发者工具
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')  // 开发环境加载 Vite 开发服务器地址
    mainWindow.webContents.openDevTools()  // 开发环境自动打开开发者工具
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))  // 生产环境加载打包后的静态文件
  }

  setTrustedRendererWebContents(mainWindow.webContents)
  mainWindow.on('closed', () => clearTrustedRendererWebContents())

  attachWindowMaximizeEvents(mainWindow)  // 监听窗口最大化事件
  attachZoomWheelHandler(mainWindow)  // 滚轮缩放：Win/Linux Ctrl+滚轮，macOS Cmd+滚轮（与 Ctrl/Cmd+/- 同一套 zoom level）
}

app.whenReady().then(async () => {  // 当应用准备好时，执行以下操作
  if (isDev && process.platform === 'darwin') {  // macOS 平台，设置 Dock 图标
    const icon = resolveAppIcon()
    if (icon) app.dock?.setIcon(icon)
  }
  registerIpcHandlersOnce()
  createWindow()

  app.on('activate', () => {  // 监听应用激活事件
    if (BrowserWindow.getAllWindows().length === 0) createWindow()  // macOS 机制：点击 Dock 图标时若无窗口则重新创建窗口
  })
})

app.on('window-all-closed', () => {  // 监听所有窗口关闭事件
  if (process.platform !== 'darwin') app.quit()  // 除 macOS 外，所有窗口关闭时退出应用
})
