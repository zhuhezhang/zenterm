import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { ipcFail, ipcOk } from '../lib/ipcResponse.js'

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
    if (!isTrustedIpcSender(e.sender)) return ipcFail('app.unauthorized', true)
    return ipcOk({ maximized: getMainWindow()?.isMaximized() ?? false })  // ?.(可选链运算符)表示如果左边不存在则返回undefined；??(空值合并运算符)表示如果当左边的表达式为 null 或者 undefined 时，它会返回右边的表达式的值，否则返回左边的表达式的值
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

/**
 * Ctrl+滚轮缩放（Windows/Linux）；与 Ctrl+/-/0 共用 webContents zoom level
 * @param {import('electron').BrowserWindow} mainWindow 主窗口实例
 */
export function attachZoomWheelHandler(mainWindow) {
  mainWindow.webContents.on('zoom-changed', (_event, zoomDirection) => {
    const wc = mainWindow.webContents
    const level = wc.getZoomLevel()
    if (zoomDirection === 'in') wc.setZoomLevel(level + 1)
    else if (zoomDirection === 'out') wc.setZoomLevel(level - 1)
  })
}
