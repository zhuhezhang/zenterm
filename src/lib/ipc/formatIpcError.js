import { isIpcErrorCode } from '../../../shared/ipcError.js'

/**
 * 将 IPC 错误码译为界面文案; 非错误码则原样返回 (库原始错误等)
 * @param {(path: string, params?: Record<string, string|number>) => string} t translateRender / useI18n().t
 * @param {unknown} code error 字段
 * @param {Record<string, string|number>} [params] errorParams
 */
export function formatIpcError(t, code, params) {
  const c = String(code ?? '').trim()
  if (!c) return ''
  if (!isIpcErrorCode(c)) return c
  const p = { ...(params || {}) }
  // 路径类错误: kind -> kindLabel, 自动补 hint
  if (p.kind && !p.kindLabel) p.kindLabel = t(`sftp.pathKind.${p.kind}`)
  if (c.startsWith('sftp.pathErrors.') && !p.hint) {
    p.hint = t('sftp.pathErrors.allowedRootsHint')
  }
  const msg = t(c, p)
  return msg !== c ? msg : c
}

/**
 * 从 IPC 响应对象取展示文案
 * @param {(path: string, params?: Record<string, string|number>) => string} t
 * @param {{ error?: string, errorParams?: Record<string, string|number>, message?: string, code?: string, params?: Record<string, string|number> }} res
 */
export function formatIpcResponseError(t, res) {
  if (!res) return ''
  const code = res.error ?? res.code ?? res.message
  const params = res.errorParams ?? res.params
  if (res.errorKnown === false) return String(code ?? '')
  return formatIpcError(t, code, params)
}

/** 终端: ipcErrorFromResponse 抛出的 Error -> 展示文案 */
export function formatThrownIpcError(t, err) {
  if (!err) return ''
  return formatIpcResponseError(t, {
    error: err.message ?? err.error,
    errorParams: err.errorParams,
    errorKnown: err.errorKnown,
  })
}
