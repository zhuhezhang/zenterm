import { app, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import { translateMain, setStoredUiLanguage } from '../i18n/translateMain.js'
import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { ipcFail, ipcFailFromThrown, ipcOk } from '../../shared/ipcResponse.js'
import { validateLogWriteDirectory, validateLocalFilePath, assertLocalFilePathAllowed } from '../lib/localPathPolicy.js'

/**
 * 弹出另存为对话框并写入文件（受 localPathPolicy 约束）
 * @param {import('electron').BrowserWindow | undefined} mainWindow
 * @param {{ title: string, defaultName: string, filters: { name: string, extensions: string[] }[], content: string, kind: string }} opts
 */
async function saveFileWithPolicyDialog(mainWindow, { title, defaultName, filters, content, kind }) {
  const safeName = path.basename(String(defaultName ?? '')) || 'file.txt'
  const result = await dialog.showSaveDialog(mainWindow, {
    title,
    defaultPath: path.join(app.getPath('downloads'), safeName),
    filters,
  })
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
 * @param {Electron.IpcMain} ipcMain ipcMain 实例
 * @param {() => import('electron').BrowserWindow | undefined} getMainWindow 获取主窗口的函数
 */
export function setupAppHandlers(ipcMain, getMainWindow) {
  ipcMain.on('app:setUiLanguage', (e, uiLanguage) => {  // 渲染进程传入 zh | en
    if (!isTrustedIpcSender(e.sender)) return
    setStoredUiLanguage(uiLanguage === 'zh' ? 'zh' : 'en')
  })

  ipcMain.handle('app:getDownloadsPath', (event) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized')
    return ipcOk({ path: app.getPath('downloads') })
  })

  ipcMain.handle('app:chooseDirectory', async (event) => {  // 选择目录
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized')
    const mainWindow = getMainWindow()
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: translateMain('app.chooseLogDirectoryTitle'),
    })
    if (result.canceled || !result.filePaths?.[0]) return ipcOk({ canceled: true })
    return ipcOk({ path: result.filePaths[0] })
  })

  ipcMain.handle('app:validateLogDirectory', (event, dir) => {  // 验证日志目录是否在允许范围内
    if (!isTrustedIpcSender(event.sender)) {
      return ipcFail('app.invalidRequest')
    }
    const s = dir == null ? '' : String(dir).trim()
    if (!s) return ipcOk()
    return validateLogWriteDirectory(s)
  })

  ipcMain.handle('app:validateLocalFilePath', (event, filePath, kind) => {
    if (!isTrustedIpcSender(event.sender)) {
      return ipcFail('app.invalidRequest')
    }
    const s = filePath == null ? '' : String(filePath).trim()
    if (!s) return ipcFail('app.invalidRequest')
    return validateLocalFilePath(s, kind || 'read')
  })

  ipcMain.handle('app:saveTerminalOutput', async (event, defaultName, text) => {
    if (!isTrustedIpcSender(event.sender)) {
      return ipcFail('app.unauthorized')
    }
    return saveFileWithPolicyDialog(getMainWindow(), {
      title: translateMain('app.saveTerminalOutputTitle'),
      defaultName: defaultName ?? 'terminal-output.txt',
      filters: [{ name: 'Text', extensions: ['txt'] }],
      content: text,
      kind: 'saveOutput',
    })
  })

  ipcMain.handle('app:saveJsonExport', async (event, defaultName, jsonText) => {
    if (!isTrustedIpcSender(event.sender)) {
      return ipcFail('app.unauthorized')
    }
    return saveFileWithPolicyDialog(getMainWindow(), {
      title: translateMain('app.saveJsonExportTitle'),
      defaultName: defaultName ?? 'export.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      content: jsonText,
      kind: 'export',
    })
  })
}
