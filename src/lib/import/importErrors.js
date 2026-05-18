/** @typedef {'invalidJson'|'fileTooLarge'|'readFailed'|'wrongFileType'|'unsupportedVersion'|'invalidPayload'|'noValidSessions'} ImportErrorCode */

/**
 * @param {ImportErrorCode} code
 * @param {Record<string, string|number>} [params]
 * @returns {Error & { code: ImportErrorCode, params?: Record<string, string|number> }}
 */
export function createImportError(code, params) {
  const err = new Error(code)
  err.code = code
  if (params) err.params = params
  return err
}
