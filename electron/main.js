import { app, BrowserWindow, ipcMain, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { setupSSHHandlers } from './handlers/ssh.js'
import { setupSFTPHandlers } from './handlers/sftp.js'
import { setupTelnetHandlers } from './handlers/telnet.js'
import { setupSerialHandlers } from './handlers/serial.js'
import { setupCredentialHandlers } from './handlers/credentials.js'
import { setupWindowHandlers, attachWindowMaximizeEvents } from './handlers/window.js'
import { setupAppHandlers } from './handlers/app.js'
import { setupLogHandlers } from './handlers/log.js'
import { setTrustedRendererWebContents, clearTrustedRendererWebContents, } from './lib/trustedSender.js'
import { detectLangFromLocaleTags } from '../shared/resolveUiLanguage.js'
import { setMainSystemUiLang } from './i18n/translateMain.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))  // 当前文件的目录路径
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged  // 兼容开发环境和生产环境的判断(通过环境变量和是否打包判读)
// const isDev = false  // 强制生产环境用于测试
const appIconPath = path.join(__dirname, '../build/icon.png')

/** 开发环境窗口 / 任务栏图标；打包后由 electron-builder 写入应用包 */
function resolveAppIcon() {
  if (!fs.existsSync(appIconPath)) return undefined
  const image = nativeImage.createFromPath(appIconPath)
  return image.isEmpty() ? undefined : image
}

let mainWindow

/** 创建主窗口，设置窗口属性和事件处理 */
function createWindow() {
  const icon = resolveAppIcon()
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    ...(icon ? { icon } : {}),
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

  const getMainWindow = () => mainWindow
  setupWindowHandlers(ipcMain, getMainWindow)
  attachWindowMaximizeEvents(mainWindow)
  setupAppHandlers(ipcMain, getMainWindow)
  setupLogHandlers(ipcMain)
}

app.whenReady().then(async () => {  // 当应用准备好时，执行以下操作
  setMainSystemUiLang(detectLangFromLocaleTags([app.getLocale()]))
  if (isDev && process.platform === 'darwin') {  // macOS 平台，设置 Dock 图标
    const icon = resolveAppIcon()
    if (icon) app.dock?.setIcon(icon)
  }
  createWindow()
  setupSSHHandlers(ipcMain, mainWindow) // 设置 SSH 相关的 IPC 处理函数
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
