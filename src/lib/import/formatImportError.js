/**
 * 将导入错误转为用户可见文案
 * @param {(key: string, params?: Record<string, string|number>) => string} t
 * @param {unknown} err
 * @returns {string}
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
