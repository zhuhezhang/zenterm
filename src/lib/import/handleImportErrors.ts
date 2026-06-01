import { formatIpcResponseError } from '../ipc/formatIpcError'
import type { TranslateFn } from '../../types/i18n'
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

export function isImportPathDeniedError(err: unknown): err is ImportError {
  return !!err && typeof err === 'object' && 'code' in err && (err as ImportError).code === 'pathDenied'
}

/** 路径不在允许范围内（IPC 文案已含「导入失败」前缀，勿再用 settings.importFail 包裹） */
export function formatImportPathDeniedMessage(t: TranslateFn, err: unknown): string {
  const importErr = err as ImportError
  const ipcMsg = importErr.ipc ? formatIpcResponseError(t, importErr.ipc) : ''
  if (ipcMsg) return ipcMsg
  return t('settings.importPathDenied', { hint: t('sftp.pathErrors.allowedRootsHint') })
}

/** 将非路径策略类的导入错误转为用户可见文案 */
export function formatImportError(t: TranslateFn, err: unknown): string {
  const importErr = err as ImportError
  const code = err && typeof err === 'object' && 'code' in err ? importErr.code : null
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

/** 导入会话/设置失败：路径策略与其它错误分开展示，避免「导入失败」重复 */
export function reportImportError(t: TranslateFn, err: unknown): void {
  if (isImportPathDeniedError(err)) {
    alert(formatImportPathDeniedMessage(t, err))
    return
  }
  alert(t('settings.importFail', { msg: formatImportError(t, err) }))
}
