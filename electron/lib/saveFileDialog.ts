import { app, dialog, type BrowserWindow, type FileFilter } from 'electron'
import fs from 'fs'
import path from 'path'
import { translateMain } from '../i18n/translateMain.js'
import { ipcFail, ipcFailFromThrown, ipcOk } from './ipcResponse.js'
import { assertLocalFilePathAllowed } from './localPathPolicy.js'

/** 另存为对话框场景 */
export type SaveFileKind = 'terminalOutput' | 'sessions' | 'settings'

/** 另存为对话框场景集合 */
const SAVE_FILE_KINDS = new Set<SaveFileKind>(['terminalOutput', 'sessions', 'settings'])

/**
 * 弹出另存为对话框并写入文件（受 localPathPolicy 约束）
 * @param mainWindow 主窗口
 * @param options 选项
 * @returns 结果
 */
async function saveFileWithPolicyDialog(
  mainWindow: BrowserWindow | undefined,
  {
    title,
    defaultName,
    filters,
    content,
    kind,
  }: {
    /** 标题 */
    title: string
    /** 默认文件名 */
    defaultName: string
    /** 文件过滤器 */
    filters: FileFilter[]
    /** 文件内容 */
    content: string
    /** 场景类型 */
    kind: string
  },
) {
  const safeName = path.basename(String(defaultName ?? '')) || 'file.txt'
  const dialogOptions = {
    title,
    message: title,
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
 * 弹出另存为对话框并按场景写入文件
 * @param mainWindow 主窗口
 * @param kind 场景类型
 * @param defaultName 默认文件名
 * @param content 文件内容
 */
export async function runSaveFileDialog(
  mainWindow: BrowserWindow | undefined,
  kind: SaveFileKind,
  defaultName: unknown,
  content: unknown,
) {
  if (!SAVE_FILE_KINDS.has(kind)) {
    return ipcFail('app.invalidRequest', true)
  }

  let title = ''
  let filters: FileFilter[] = []
  let policyKind = ''
  let safeDefaultName = ''

  switch (kind) {
    case 'terminalOutput':
      title = translateMain('app.saveTerminalOutputTitle')
      filters = [{ name: 'Text', extensions: ['txt'] }]
      policyKind = 'saveOutput'
      safeDefaultName = String(defaultName ?? 'terminal-output.txt')
      break
    case 'sessions':
      title = translateMain('app.saveSessionJsonExportTitle')
      filters = [{ name: 'JSON', extensions: ['json'] }]
      policyKind = 'export'
      safeDefaultName = String(defaultName ?? 'export.json')
      break
    case 'settings':
      title = translateMain('app.saveSettingsJsonExportTitle')
      filters = [{ name: 'JSON', extensions: ['json'] }]
      policyKind = 'export'
      safeDefaultName = String(defaultName ?? 'export.json')
      break
  }

  return saveFileWithPolicyDialog(mainWindow, {
    title,
    defaultName: safeDefaultName,
    filters,
    content: String(content ?? ''),
    kind: policyKind,
  })
}
