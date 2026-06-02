import { app, dialog } from 'electron'
import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import fs from 'fs'
import path from 'path'
import { translateMain, setStoredUiLanguage } from '../i18n/translateMain.js'
import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { ipcFail, ipcFailFromThrown, ipcOk } from '../lib/ipcResponse.js'
import { validateLogWriteDirectory, validateLocalFilePath, assertLocalFilePathAllowed } from '../lib/localPathPolicy.js'
import type { MainWindowGetter, SaveFilePolicyOptions } from '../types/handlers.js'
import type { BrowserWindow } from 'electron'

/**
 * 弹出另存为对话框并写入文件（受 localPathPolicy 约束）
 * @param mainWindow 主窗口
 * @param SaveFilePolicyOptions 保存文件选项
 */
async function saveFileWithPolicyDialog(
  mainWindow: BrowserWindow | undefined,
  { title, defaultName, filters, content, kind }: SaveFilePolicyOptions,
) {
  const safeName = path.basename(String(defaultName ?? '')) || 'file.txt'
  const dialogOptions = {
    title,
    defaultPath: path.join(app.getPath('downloads'), safeName),
    filters,
  }
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions)
  if (result.canceled || !result.filePath) {
    return ipcOk({ canceled: true })
  }
  try {
    assertLocalFilePathAllowed(result.filePath, kind)
    fs.writeFileSync(result.filePath, String(content ?? ''), 'utf8')
    return ipcOk()
  } catch (e) {
    return ipcFailFromThrown(e)
  }
}

/**
 * 设置应用程序处理程序
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

  ipcMain.handle('app:chooseDirectory', async (event: IpcMainInvokeEvent) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const mainWindow = getMainWindow()
    const openOptions = {
      properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[],
      title: translateMain('app.chooseLogDirectoryTitle'),
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, openOptions)
      : await dialog.showOpenDialog(openOptions)
    if (result.canceled || !result.filePaths?.[0]) return ipcOk({ canceled: true })
    return ipcOk({ path: result.filePaths[0] })
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

  ipcMain.handle('app:saveTerminalOutput', async (event: IpcMainInvokeEvent, defaultName: unknown, text: unknown) => {
    if (!isTrustedIpcSender(event.sender)) {
      return ipcFail('app.unauthorized', true)
    }
    return saveFileWithPolicyDialog(getMainWindow() ?? undefined, {
      title: translateMain('app.saveTerminalOutputTitle'),
      defaultName: String(defaultName ?? 'terminal-output.txt'),
      filters: [{ name: 'Text', extensions: ['txt'] }],
      content: String(text ?? ''),
      kind: 'saveOutput',
    })
  })

  ipcMain.handle('app:saveJsonExport', async (event: IpcMainInvokeEvent, defaultName: unknown, jsonText: unknown) => {
    if (!isTrustedIpcSender(event.sender)) {
      return ipcFail('app.unauthorized', true)
    }
    return saveFileWithPolicyDialog(getMainWindow() ?? undefined, {
      title: translateMain('app.saveJsonExportTitle'),
      defaultName: String(defaultName ?? 'export.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }],
      content: String(jsonText ?? ''),
      kind: 'export',
    })
  })
}
