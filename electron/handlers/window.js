import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { ipcFail, ipcOk } from '../../shared/ipcResponse.js'

/**
 * 窗口处理程序
 * @param {Electron.IpcMain} ipcMain ipcMain 实例
 * @param {() => import('electron').BrowserWindow | undefined} getMainWindow 获取主窗口的函数
 */
export function setupWindowHandlers(ipcMain, getMainWindow) {
  ipcMain.on('window:minimize', (e) => {  // 最小化窗口
    if (!isTrustedIpcSender(e.sender)) return
    getMainWindow()?.minimize()
  })
  ipcMain.on('window:maximize', (e) => {  // 最大化窗口
    if (!isTrustedIpcSender(e.sender)) return
    const win = getMainWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window:close', (e) => {  // 关闭窗口
    if (!isTrustedIpcSender(e.sender)) return
    getMainWindow()?.close()
  })
  ipcMain.handle('window:isMaximized', (e) => {  // 检查窗口是否最大化
    if (!isTrustedIpcSender(e.sender)) return ipcFail('app.unauthorized')
    return ipcOk({ maximized: getMainWindow()?.isMaximized() ?? false })
  })
  ipcMain.on('window:setBackgroundColor', (e, hex) => {  // 设置窗口背景颜色
    if (!isTrustedIpcSender(e.sender)) return
    const mainWindow = getMainWindow()
    if (!mainWindow || typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) return
    try {
      mainWindow.setBackgroundColor(hex)
    } catch (_) {}
  })
}

/**
 * 监听窗口最大化事件
 * @param {import('electron').BrowserWindow} mainWindow 主窗口实例
 */
export function attachWindowMaximizeEvents(mainWindow) {
  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized', true))  // 窗口最大化
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized', false))  // 窗口取消最大化
}
