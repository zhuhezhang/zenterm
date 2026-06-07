import { getZterm } from '../ipc/getZterm'
import { isIpcFailure } from '../ipc/ipcResponse'
import { createImportError } from './handleImportErrors'

/**
 * 校验导入 JSON 文件路径是否符合 localPathPolicy
 * @param file 用户选择的文件
 * @returns 是否允许导入
 */
export async function assertImportFilePathAllowed(file: File): Promise<void> {
  if (!file) {
    throw createImportError('readFailed')
  }
  const filePath = getZterm().paths.getPathForFile(file) ?? ''
  if (!filePath) {
    throw createImportError('readFailed')
  }
  const vr = await getZterm().paths.validateLocalFilePath(filePath, 'import')
  if (isIpcFailure(vr)) {
    const err = createImportError('pathDenied')
    err.ipc = vr
    throw err
  }
}
