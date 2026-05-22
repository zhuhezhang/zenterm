import { isTrustedIpcSender } from '../lib/trustedSender.js'

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {() => import('electron').BrowserWindow | undefined} getMainWindow
 */
export function setupWindowHandlers(ipcMain, getMainWindow) {
  ipcMain.on('window:minimize', (e) => {
    if (!isTrustedIpcSender(e.sender)) return
    getMainWindow()?.minimize()
  })
  ipcMain.on('window:maximize', (e) => {
    if (!isTrustedIpcSender(e.sender)) return
    const win = getMainWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window:close', (e) => {
    if (!isTrustedIpcSender(e.sender)) return
    getMainWindow()?.close()
  })
  ipcMain.handle('window:isMaximized', (e) => {
    if (!isTrustedIpcSender(e.sender)) return false
    return getMainWindow()?.isMaximized() ?? false
  })
  ipcMain.on('window:setBackgroundColor', (e, hex) => {
    if (!isTrustedIpcSender(e.sender)) return
    const mainWindow = getMainWindow()
    if (!mainWindow || typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) return
    try {
      mainWindow.setBackgroundColor(hex)
    } catch (_) {}
  })
}

/**
 * @param {import('electron').BrowserWindow} mainWindow
 */
export function attachWindowMaximizeEvents(mainWindow) {
  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized', false))
}
