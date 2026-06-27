import { app, shell } from 'electron'
import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { setStoredUiLanguage } from '../i18n/translateMain.js'
import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { ipcFail, ipcFailFromThrown, ipcOk } from '../lib/ipcResponse.js'
import { validateLogWriteDirectory, validateLocalFilePath } from '../lib/localPathPolicy.js'
import { clearKnownHostsStore, clearSessionHostKeyCache } from '../lib/sshKnownHosts.js'
import { runChooseOpenDialog } from '../lib/chooseOpenDialog.js'
import type { ChooseOpenKind } from '../lib/chooseOpenDialog.js'
import { runSaveFileDialog } from '../lib/saveFileDialog.js'
import type { SaveFileKind } from '../lib/saveFileDialog.js'
import type { MainWindowGetter } from '../types/handlers.js'

/**
 * 设置应用程序处理程序
 * @param ipcMain IPC 主进程
 * @param getMainWindow 获取主窗口
 */
export function setupAppHandlers(ipcMain: IpcMain, getMainWindow: MainWindowGetter) {
  ipcMain.on('app:setUiLanguage', (e: IpcMainEvent, uiLanguage: unknown) => {
    if (!isTrustedIpcSender(e.sender)) return
    setStoredUiLanguage(uiLanguage === 'zh' ? 'zh' : 'en')
  })

  ipcMain.handle('app:getDownloadsPath', (event: IpcMainInvokeEvent) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    return ipcOk({ path: app.getPath('downloads') })
  })

  ipcMain.handle('app:getVersion', (event: IpcMainInvokeEvent) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    return ipcOk({ version: app.getVersion() })
  })

  ipcMain.handle('app:openExternal', async (event: IpcMainInvokeEvent, url: unknown) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const s = typeof url === 'string' ? url.trim() : ''
    if (!/^https?:\/\//i.test(s)) return ipcFail('app.invalidRequest', true)
    try {
      await shell.openExternal(s)
      return ipcOk()
    } catch (e) {
      return ipcFailFromThrown(e)
    }
  })

  ipcMain.handle('app:chooseOpen', async (event: IpcMainInvokeEvent, kind: unknown) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (typeof kind !== 'string') return ipcFail('app.invalidRequest', true)
    return runChooseOpenDialog(getMainWindow() ?? undefined, kind as ChooseOpenKind)
  })

  ipcMain.handle('app:saveFile', async (event: IpcMainInvokeEvent, kind: unknown, defaultName: unknown, content: unknown) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (typeof kind !== 'string') return ipcFail('app.invalidRequest', true)
    return runSaveFileDialog(getMainWindow() ?? undefined, kind as SaveFileKind, defaultName, content)
  })

  ipcMain.handle('app:validateLogDirectory', (event: IpcMainInvokeEvent, dir: unknown) => {
    if (!isTrustedIpcSender(event.sender)) {
      return ipcFail('app.invalidRequest', true)
    }
    const s = dir == null ? '' : String(dir).trim()
    if (!s) return ipcOk()
    return validateLogWriteDirectory(s)
  })

  ipcMain.handle('app:validateLocalFilePath', (event: IpcMainInvokeEvent, filePath: unknown, kind: unknown) => {
    if (!isTrustedIpcSender(event.sender)) {
      return ipcFail('app.invalidRequest', true)
    }
    const s = filePath == null ? '' : String(filePath).trim()
    if (!s) return ipcFail('app.invalidRequest', true)
    return validateLocalFilePath(s, typeof kind === 'string' ? kind : 'read')
  })

  ipcMain.handle('app:clearKnownHosts', (event: IpcMainInvokeEvent) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    try {
      clearKnownHostsStore()
      return ipcOk()
    } catch (e) {
      return ipcFailFromThrown(e)
    }
  })

  ipcMain.handle('app:clearSessionHostKeyCache', (event: IpcMainInvokeEvent) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    clearSessionHostKeyCache()
    return ipcOk()
  })
}
