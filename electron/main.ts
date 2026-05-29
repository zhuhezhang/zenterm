import { app, BrowserWindow, ipcMain, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { setupSSHHandlers } from './handlers/ssh.js'
import { setupSFTPHandlers } from './handlers/sftp.js'
import { setupTelnetHandlers } from './handlers/telnet.js'
import { setupSerialHandlers } from './handlers/serial.js'
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
  setupWindowHandlers(ipcMain, getMainWindow)
  setupAppHandlers(ipcMain, getMainWindow)
  setupLogHandlers(ipcMain)
  setupSSHHandlers(ipcMain, getMainWindow)
  setupSFTPHandlers(ipcMain, getMainWindow)
  setupTelnetHandlers(ipcMain, getMainWindow)
  setupSerialHandlers(ipcMain, getMainWindow)
  setupCredentialHandlers(ipcMain)
}

/** 创建主窗口，设置窗口属性和事件处理 */
function createWindow() {
  const icon = resolveAppIcon()
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    ...(icon ? { icon } : {}),
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: isDev,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  setTrustedRendererWebContents(mainWindow.webContents)
  mainWindow.on('closed', () => clearTrustedRendererWebContents())

  attachWindowMaximizeEvents(mainWindow)
  attachZoomWheelHandler(mainWindow)
}

app.whenReady().then(async () => {
  if (isDev && process.platform === 'darwin') {
    const icon = resolveAppIcon()
    if (icon) app.dock?.setIcon(icon)
  }
  registerIpcHandlersOnce()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
