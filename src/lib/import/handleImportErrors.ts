import { formatIpcResponseError } from '../ipc/formatIpcError'
import type { ImportError } from '../../types/errors'

/**
 * 创建导入错误，用于在导入过程中抛出错误
 */
export function createImportError(
  code: string,
  params?: Record<string, string | number>,
): ImportError {
  const err = new Error(code) as ImportError
  err.code = code
  if (params) err.params = params
  return err
}

/**
 * 将导入错误转为国际化的用户可见文案
 * @param {(key: string, params?: Record<string, string|number>) => string} t 国际化的翻译函数
 * @param {unknown} err 导入错误
 * @returns {string} 用户可见文案
 */
export function formatImportError(
  t: (key: string, params?: Record<string, string | number>) => string,
  err: unknown,
) {
  const importErr = err as ImportError
  const code = err && typeof err === 'object' && 'code' in err ? importErr.code : null
  if (code === 'pathDenied' && importErr.ipc) {
    return formatIpcResponseError(t, importErr.ipc) || t('settings.importPathDenied')
  }
  if (typeof code === 'string') {
    const key = `settings.importErrors.${code}`
    const params = { ...(importErr.params || {}) }
    if (code === 'wrongFileType' && params.kindKey) {
      params.kind = t(`settings.importFileKind.${params.kindKey}`)
      delete params.kindKey
    }
    const msg = t(key, params)
    if (msg !== key) return msg
  }
  if (err instanceof Error && err.message) return err.message
  return String(err ?? '')
}
