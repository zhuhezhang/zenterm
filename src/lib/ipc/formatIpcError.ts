import { ipcErrorFields, isIpcFailure } from './ipcResponse'

/**
 * 将 IPC 错误码译为界面文案（仅 errorKnown 为 true 时调用）
 * @param {(path: string, params?: Record<string, string|number>) => string} t translateRender / useI18n().t
 * @param {unknown} code 错误码（如 sftp.pathErrors.localFileDenied）
 * @param {Record<string, string|number>} [params] 错误参数（如{name: '张三'}）
 * @returns {string} 展示文案
 */
export function formatIpcError(t, code, params) {
  const c = String(code ?? '').trim()
  if (!c) return ''
  const p = { ...(params || {}) }
  if (p.kind && !p.kindLabel) p.kindLabel = t(`sftp.pathKind.${p.kind}`)
  if (c.startsWith('sftp.pathErrors.') && !p.hint) {
    p.hint = t('sftp.pathErrors.allowedRootsHint')
  }
  const msg = t(c, p)
  return msg !== c ? msg : c
}

/**
 * 从 IPC 响应对象取展示文案（是否翻译由 errorKnown 决定）
 * @param {(path: string, params?: Record<string, string|number>) => string} t 翻译函数
 * @param {{ success?: boolean, errorKnown?: boolean, content?: Record<string, unknown> }} res 错误响应对象
 * @returns {string} 展示文案
 */
/**
 * 失败则 alert 并返回 true；成功或未失败返回 false
 * @param {(path: string, params?: Record<string, string|number>) => string} t
 * @param {{ success?: boolean, errorKnown?: boolean, content?: Record<string, unknown> } | null | undefined} res
 * @param {string} [fallbackKey] i18n 键
 * @returns {boolean} 是否已 alert
 */
export function alertIpcFailure(t, res, fallbackKey) {
  if (!isIpcFailure(res)) return false
  alert(formatIpcResponseError(t, res) || (fallbackKey ? t(fallbackKey) : ''))
  return true
}

export function formatIpcResponseError(t, res) {
  if (!isIpcFailure(res)) return ''
  const { error, errorParams, errorKnown } = ipcErrorFields(res)
  if (errorKnown === false) return String(error ?? '')
  return formatIpcError(t, error, errorParams)
}

/**
 * 终端: ipcErrorFromResponse 抛出的 Error -> 展示文案
 * @param {(path: string, params?: Record<string, string|number>) => string} t 翻译函数
 * @param {unknown} err 错误对象
 * @returns {string} 展示文案
 */
export function formatThrownIpcError(t, err) {
  if (!err) return ''
  return formatIpcResponseError(t, {
    success: false,
    errorKnown: err.errorKnown,
    content: {
      error: err.message ?? err.error,
      errorParams: err.errorParams,
    },
  })
}
