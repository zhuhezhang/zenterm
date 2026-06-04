import type { BrowserWindow, IpcMain, IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron'
import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { ipcFail, ipcOk } from '../lib/ipcResponse.js'
import type { MainWindowGetter } from '../types/handlers.js'

/** 
 * 缩放 webContents
 * @param wc WebContents
 * @param zoomDirection 缩放方向
 */
function stepWebContentsZoom(wc: WebContents, zoomDirection: 'in' | 'out') {
  const level = wc.getZoomLevel()
  if (zoomDirection === 'in') wc.setZoomLevel(level + 1)
  else if (zoomDirection === 'out') wc.setZoomLevel(level - 1)
}

/**
 * 窗口处理程序
 * @param ipcMain IPC 主进程
 * @param getMainWindow 获取主窗口
 */
export function setupWindowHandlers(ipcMain: IpcMain, getMainWindow: MainWindowGetter) {
  ipcMain.on('window:minimize', (e: IpcMainEvent) => {  // 处理来自渲染进程的最小化请求
    if (!isTrustedIpcSender(e.sender)) return
    getMainWindow()?.minimize()
  })
  ipcMain.on('window:maximize', (e: IpcMainEvent) => {  // 处理来自渲染进程的最大化请求
    if (!isTrustedIpcSender(e.sender)) return
    const win = getMainWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window:close', (e: IpcMainEvent) => {  // 处理来自渲染进程的关闭请求
    if (!isTrustedIpcSender(e.sender)) return
    getMainWindow()?.close()
  })
  ipcMain.handle('window:isMaximized', (e: IpcMainInvokeEvent) => {  // 处理来自渲染进程的获取最大化状态请求
    if (!isTrustedIpcSender(e.sender)) return ipcFail('app.unauthorized', true)
    return ipcOk({ maximized: getMainWindow()?.isMaximized() ?? false })
  })
  ipcMain.on('window:setBackgroundColor', (e: IpcMainEvent, hex: string) => {  // 处理来自渲染进程的设置背景颜色请求
    if (!isTrustedIpcSender(e.sender)) return
    const mainWindow = getMainWindow()
    if (!mainWindow || !/^#[0-9a-fA-F]{6}$/.test(hex)) return
    try {
      mainWindow.setBackgroundColor(hex)
    } catch {}
  })
  ipcMain.on('window:zoomWheelStep', (e: IpcMainEvent, deltaY: number) => {  // 处理来自渲染进程的滚轮缩放请求
    if (!isTrustedIpcSender(e.sender) || process.platform !== 'darwin') return
    const mainWindow = getMainWindow()
    if (!mainWindow || !Number.isFinite(deltaY) || deltaY === 0) return
    stepWebContentsZoom(mainWindow.webContents, deltaY < 0 ? 'in' : 'out')
  })
}

/**
 * 监听窗口最大化事件
 * @param mainWindow 主窗口
 */
export function attachWindowMaximizeEvents(mainWindow: BrowserWindow) {
  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized', true))  // 处理窗口最大化事件
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized', false))  // 处理窗口取消最大化事件
}

/**
 * 滚轮缩放；与 Ctrl/Cmd+/-/0 共用 webContents zoom level。
 * Windows/Linux：Ctrl+滚轮由 Chromium 触发 zoom-changed；macOS：Cmd+滚轮由渲染进程 wheel + IPC 触发。
 * @param mainWindow 主窗口
 */
export function attachZoomWheelHandler(mainWindow: BrowserWindow) {
  const wc = mainWindow.webContents
  wc.on('zoom-changed', (_event, zoomDirection: 'in' | 'out') => {  // 处理滚轮缩放事件
    stepWebContentsZoom(wc, zoomDirection)
  })
}
