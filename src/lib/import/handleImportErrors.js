/**
 * 创建导入错误，用于在导入过程中抛出错误
 * @param {string} code 错误码
 * @param {Record<string, string|number>} [params] 错误参数（用于国际化翻译函数）
 * @returns {Error & { code: string, params?: Record<string, string|number> }} 错误对象
 */
export function createImportError(code, params) {
  const err = new Error(code)
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
export function formatImportError(t, err) {
  const code = err && typeof err === 'object' && 'code' in err ? err.code : null
  if (typeof code === 'string') {
    const key = `settings.importErrors.${code}`
    const msg = t(key, err.params || {})
    if (msg !== key) return msg
  }
  if (err instanceof Error && err.message) return err.message
  return String(err ?? '')
}