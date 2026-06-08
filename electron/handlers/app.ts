import { app, dialog } from 'electron'
import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import fs from 'fs'
import path from 'path'
import { translateMain, setStoredUiLanguage } from '../i18n/translateMain.js'
import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { ipcFail, ipcFailFromThrown, ipcOk } from '../lib/ipcResponse.js'
import { validateLogWriteDirectory, validateLocalFilePath, assertLocalFilePathAllowed } from '../lib/localPathPolicy.js'
import { isPrivateKeyPemContent } from '../../shared/privateKeyMaterial.js'
import { clearKnownHostsStore, clearSessionHostKeyCache } from '../lib/sshKnownHosts.js'
import type { MainWindowGetter, SaveFilePolicyOptions } from '../types/handlers.js'
import type { BrowserWindow } from 'electron'

/**
 * 弹出另存为对话框并写入文件（受 localPathPolicy 约束）
 * @param mainWindow 主窗口
 * @param options 保存文件选项
 * @returns 保存文件结果
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
 * @param ipcMain IPC 主进程
 * @param getMainWindow 获取主窗口
 */
export function setupAppHandlers(ipcMain: IpcMain, getMainWindow: MainWindowGetter) {
  ipcMain.on('app:setUiLanguage', (e: IpcMainEvent, uiLanguage: unknown) => {  // 监听设置语言事件
    if (!isTrustedIpcSender(e.sender)) return
    setStoredUiLanguage(uiLanguage === 'zh' ? 'zh' : 'en')
  })

  ipcMain.handle('app:getDownloadsPath', (event: IpcMainInvokeEvent) => {  // 处理获取下载路径请求
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    return ipcOk({ path: app.getPath('downloads') })
  })

  ipcMain.handle('app:chooseDirectory', async (event: IpcMainInvokeEvent, kind: unknown) => {  // 处理选择目录请求
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const mainWindow = getMainWindow()
    let title = ''
    switch (kind) {
      case 'logSave':
        title = translateMain('app.chooseLogDirectoryTitle')
        break
      case 'sftpDownload':
        title = translateMain('app.chooseSftpDownloadTitle')
        break
      default:
        title = translateMain('app.chooseDirectoryTitle')
        break
    }
    const openOptions = {
      properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[],
      title: title,
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, openOptions)
      : await dialog.showOpenDialog(openOptions)
    if (result.canceled || !result.filePaths?.[0]) return ipcOk({ canceled: true })
    return ipcOk({ path: result.filePaths[0] })
  })

  ipcMain.handle('app:choosePrivateKeyFile', async (event: IpcMainInvokeEvent) => {  // 选择并读取私钥文件
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const mainWindow = getMainWindow()
    const openOptions = {
      properties: ['openFile'] as ('openFile')[],
      title: translateMain('app.choosePrivateKeyFileTitle'),
      filters: [
        { name: 'Private Key', extensions: ['pem', 'key', 'ppk'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, openOptions)
      : await dialog.showOpenDialog(openOptions)
    if (result.canceled || !result.filePaths?.[0]) return ipcOk({ canceled: true })

    const filePath = result.filePaths[0]
    try {
      assertLocalFilePathAllowed(filePath, 'read')
      const stat = fs.statSync(filePath)
      if (!stat.isFile()) return ipcFail('ssh.privateKeyInvalid', true)
      const content = fs.readFileSync(filePath, 'utf8').trim()
      if (!isPrivateKeyPemContent(content)) return ipcFail('ssh.privateKeyInvalid', true)
      return ipcOk({ path: filePath, content })
    } catch (e) {
      return ipcFailFromThrown(e)
    }
  })

  ipcMain.handle('app:validateLogDirectory', (event: IpcMainInvokeEvent, dir: unknown) => {  // 处理验证日志目录请求
    if (!isTrustedIpcSender(event.sender)) {
      return ipcFail('app.invalidRequest', true)
    }
    const s = dir == null ? '' : String(dir).trim()
    if (!s) return ipcOk()
    return validateLogWriteDirectory(s)
  })

  ipcMain.handle('app:validateLocalFilePath', (event: IpcMainInvokeEvent, filePath: unknown, kind: unknown) => {  // 处理验证本地文件路径请求
    if (!isTrustedIpcSender(event.sender)) {
      return ipcFail('app.invalidRequest', true)
    }
    const s = filePath == null ? '' : String(filePath).trim()
    if (!s) return ipcFail('app.invalidRequest', true)
    return validateLocalFilePath(s, typeof kind === 'string' ? kind : 'read')
  })

  ipcMain.handle('app:saveTerminalOutput', async (event: IpcMainInvokeEvent, defaultName: unknown, text: unknown) => {  // 处理保存终端输出请求
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

  ipcMain.handle('app:saveJsonExport', async (event: IpcMainInvokeEvent, kind: unknown, defaultName: unknown, jsonText: unknown) => {  // 处理保存 JSON 导出请求
    if (!isTrustedIpcSender(event.sender)) {
      return ipcFail('app.unauthorized', true)
    }
    let title = ''
    switch (kind) {
      case 'sessions':
        title = translateMain('app.saveSessionJsonExportTitle')
        break
      case 'settings':
        title = translateMain('app.saveSettingsJsonExportTitle')
        break
      default:
        title = translateMain('app.saveJsonExportTitle')
        break
    }
    return saveFileWithPolicyDialog(getMainWindow() ?? undefined, {
      title: title,
      defaultName: String(defaultName ?? 'export.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }],
      content: String(jsonText ?? ''),
      kind: 'export',
    })
  })

  ipcMain.handle('app:clearKnownHosts', (event: IpcMainInvokeEvent) => {  // 清空 SSH 已知主机公钥存储
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    try {
      clearKnownHostsStore()
      return ipcOk()
    } catch (e) {
      return ipcFailFromThrown(e)
    }
  })

  ipcMain.handle('app:clearSessionHostKeyCache', (event: IpcMainInvokeEvent) => {  // 清空本会话临时主机公钥缓存
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    clearSessionHostKeyCache()
    return ipcOk()
  })
}
