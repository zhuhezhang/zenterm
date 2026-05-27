import { isIpcFailure } from '../ipc/ipcResponse'
import { createImportError } from './handleImportErrors'

/**
 * 校验导入 JSON 文件路径是否符合 localPathPolicy
 * @param {File} file 用户选择的文件
 */
export async function assertImportFilePathAllowed(file) {
  if (!file) {
    throw createImportError('readFailed')
  }
  const filePath = window.zterm?.paths?.getPathForFile?.(file) ?? ''
  if (!filePath) {
    throw createImportError('readFailed')
  }
  const vr = await window.zterm.paths.validateLocalFilePath(filePath, 'import')
  if (isIpcFailure(vr)) {
    const err = createImportError('pathDenied')
    err.ipc = vr
    throw err
  }
}
