import { app, dialog } from 'electron'
import { translateMain, setStoredUiLanguage } from '../i18n/translateMain.js'
import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { ipcFail } from '../../shared/ipcError.js'
import { validateLogWriteDirectory } from '../lib/localPathPolicy.js'

/**
 * 设置应用程序处理程序
 * @param {Electron.IpcMain} ipcMain ipcMain 实例
 * @param {() => import('electron').BrowserWindow | undefined} getMainWindow 获取主窗口的函数
 */
export function setupAppHandlers(ipcMain, getMainWindow) {
  ipcMain.on('app:setUiLanguage', (e, uiLanguage) => {  // 渲染进程传入 zh | en
    if (!isTrustedIpcSender(e.sender)) return
    setStoredUiLanguage(uiLanguage === 'zh' ? 'zh' : 'en')
  })

  ipcMain.on('app:getDownloadsPath', (e) => {  // 获取下载目录路径
    if (!isTrustedIpcSender(e.sender)) {
      e.returnValue = ''
      return
    }
    e.returnValue = app.getPath('downloads')
  })

  ipcMain.handle('app:chooseDirectory', async (event) => {  // 选择目录
    if (!isTrustedIpcSender(event.sender)) return null
    const mainWindow = getMainWindow()
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: translateMain('app.chooseLogDirectoryTitle'),
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('app:validateLogDirectory', (event, dir) => {  // 验证日志目录是否在允许范围内
    if (!isTrustedIpcSender(event.sender)) {
      return ipcFail('app.invalidRequest')
    }
    const s = dir == null ? '' : String(dir).trim()
    if (!s) return { success: true }
    return validateLogWriteDirectory(s)
  })
}
