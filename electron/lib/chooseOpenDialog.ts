import { dialog, type BrowserWindow } from 'electron'
import fs from 'fs'
import { isPrivateKeyPemContent } from '../../shared/privateKeyMaterial.js'
import { IMPORT_MAX_BYTES } from '../../shared/others.js'
import { translateMain } from '../i18n/translateMain.js'
import { createIpcError, ipcFail, ipcFailFromThrown, ipcOk } from './ipcResponse.js'
import { assertLocalFilePathAllowed } from './localPathPolicy.js'
import { walkLocalDir } from './walkLocalDir.js'

/** 打开文件/目录对话框场景 */
export type ChooseOpenKind =
  | 'logSave'
  | 'sftpDownload'
  | 'sftpUploadFiles'
  | 'sftpUploadFolder'
  | 'importSessions'
  | 'importSettings'
  | 'privateKey'

/** 打开文件/目录对话框场景集合 */
const CHOOSE_OPEN_KINDS = new Set<ChooseOpenKind>([
  'logSave',
  'sftpDownload',
  'sftpUploadFiles',
  'sftpUploadFolder',
  'importSessions',
  'importSettings',
  'privateKey',
])

/**
 * 读取导入用 JSON 文本（路径策略与大小校验）
 * @param filePath 文件路径
 * @returns 文件文本
 */
function readImportTextFile(filePath: string): string {
  assertLocalFilePathAllowed(filePath, 'import')
  const stat = fs.statSync(filePath)
  if (!stat.isFile()) {
    throw new Error('Not a file')
  }
  if (stat.size > IMPORT_MAX_BYTES) {
    throw createIpcError('settings.importErrors.fileTooLarge', {
      max: IMPORT_MAX_BYTES / 1024 / 1024,
    })
  }
  return fs.readFileSync(filePath, 'utf8')
}

/**
 * 读取并校验私钥 PEM 文件
 * @param filePath 文件路径
 * @returns 私钥 PEM 文本
 */
function readPrivateKeyTextFile(filePath: string): string {
  assertLocalFilePathAllowed(filePath, 'read')
  const stat = fs.statSync(filePath)
  if (!stat.isFile()) {
    throw createIpcError('ssh.privateKeyInvalid')
  }
  const content = fs.readFileSync(filePath, 'utf8').trim()
  if (!isPrivateKeyPemContent(content)) {
    throw createIpcError('ssh.privateKeyInvalid')
  }
  return content
}

/**
 * 弹出打开文件/目录对话框并按场景返回结果
 * @param mainWindow 主窗口
 * @param kind 场景类型
 */
export async function runChooseOpenDialog(mainWindow: BrowserWindow | undefined, kind: ChooseOpenKind) {
  if (!CHOOSE_OPEN_KINDS.has(kind)) {
    return ipcFail('app.invalidRequest', true)
  }

  let title = ''
  let properties: ('openFile' | 'openDirectory' | 'multiSelections' | 'createDirectory')[] = []
  let filters: { name: string; extensions: string[] }[] | undefined

  switch (kind) {
    case 'logSave':  // 日志保存目录
      title = translateMain('app.chooseLogDirectoryTitle')
      properties = ['openDirectory', 'createDirectory']
      break
    case 'sftpDownload':  // SFTP下载目录
      title = translateMain('app.chooseSftpDownloadTitle')
      properties = ['openDirectory', 'createDirectory']
      break
    case 'sftpUploadFiles':  // SFTP上传文件
      title = translateMain('app.chooseSftpUploadFilesTitle')
      properties = ['openFile', 'multiSelections']
      break
    case 'sftpUploadFolder':  // SFTP上传文件夹
      title = translateMain('app.chooseSftpUploadFolderTitle')
      properties = ['openDirectory']
      break
    case 'importSessions':  // 导入会话JSON文件
      title = translateMain('app.importSessionsFileTitle')
      properties = ['openFile']
      filters = [{ name: 'JSON', extensions: ['json'] }]
      break
    case 'importSettings':  // 导入设置JSON文件
      title = translateMain('app.importSettingsFileTitle')
      properties = ['openFile']
      filters = [{ name: 'JSON', extensions: ['json'] }]
      break
    case 'privateKey':  // 选择私钥文件
      title = translateMain('app.choosePrivateKeyFileTitle')
      properties = ['openFile']
      filters = [
        { name: 'Private Key', extensions: ['pem', 'key', 'ppk'] },
        { name: 'All Files', extensions: ['*'] },
      ]
      break
  }

  /** 打开文件/目录对话框选项 */
  const openOptions = {
    title,
    message: title,
    properties,
    ...(filters ? { filters } : {}),
  }
  /** 打开文件/目录对话框结果 */
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, openOptions)
    : await dialog.showOpenDialog(openOptions)

  /** 如果用户取消或没有选择文件，返回取消结果 */
  if (result.canceled || !result.filePaths?.length) {
    return ipcOk({ canceled: true })
  }

  try {
    if (kind === 'logSave' || kind === 'sftpDownload') {  // 如果选择了日志保存目录或SFTP下载目录，返回选择结果
      return ipcOk({ path: result.filePaths[0] })
    }

    if (kind === 'sftpUploadFiles') {  // 如果选择了SFTP上传文件，返回选择结果
      const paths: string[] = []
      for (const filePath of result.filePaths) {
        assertLocalFilePathAllowed(filePath, 'upload')
        const stat = fs.statSync(filePath)
        if (stat.isFile()) paths.push(filePath)
      }
      if (!paths.length) return ipcOk({ canceled: true })
      return ipcOk({ paths })
    }

    if (kind === 'sftpUploadFolder') {  // 如果选择了SFTP上传文件夹，返回选择结果
      const entries = walkLocalDir(result.filePaths[0], 'upload')
      if (!entries.length) return ipcOk({ canceled: true })
      return ipcOk({ entries })
    }

    const filePath = result.filePaths[0]
    if (kind === 'privateKey') {  // 如果选择了私钥文件，返回选择结果
      const content = readPrivateKeyTextFile(filePath)
      return ipcOk({ path: filePath, content })
    }

    const content = readImportTextFile(filePath)  // 如果选择了导入会话或设置JSON文件，返回选择结果
    return ipcOk({ path: filePath, content })
  } catch (e) {
    return ipcFailFromThrown(e)
  }
}
