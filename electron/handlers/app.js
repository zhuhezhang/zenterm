import { app, dialog } from 'electron'
import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { setStoredUiLanguage } from '../lib/uiLanguageState.js'
import { validateLogWriteDirectory } from '../lib/localPathPolicy.js'

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {() => import('electron').BrowserWindow | undefined} getMainWindow
 */
export function setupAppHandlers(ipcMain, getMainWindow) {
  ipcMain.on('app:setUiLanguage', (e, uiLanguage) => {
    if (!isTrustedIpcSender(e.sender)) return
    setStoredUiLanguage(uiLanguage)
  })

  ipcMain.on('app:getDownloadsPath', (e) => {
    if (!isTrustedIpcSender(e.sender)) {
      e.returnValue = ''
      return
    }
    e.returnValue = app.getPath('downloads')
  })

  ipcMain.handle('app:chooseDirectory', async (event) => {
    if (!isTrustedIpcSender(event.sender)) return null
    const mainWindow = getMainWindow()
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择日志保存目录',
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('app:validateLogDirectory', (event, dir) => {
    if (!isTrustedIpcSender(event.sender)) return { ok: false, message: '无效的请求。' }
    const s = dir == null ? '' : String(dir).trim()
    if (!s) return { ok: true }
    return validateLogWriteDirectory(s)
  })
}
