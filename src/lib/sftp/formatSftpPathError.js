import { isSftpErrorCode, SFTP_ERROR } from '../../../shared/sftpErrorCodes.js'

/**
 * 从 IPC 结果或 Error 对象提取错误码与参数
 * @param {unknown} source IPC 结果、Error 或含 errorCode 的对象
 * @returns {{ code: string, params: Record<string, string> } | null} 返回错误码与参数
 */
function extractSftpError(source) {
  if (!source || typeof source !== 'object') return null
  const code = 'errorCode' in source && source.errorCode
    ? source.errorCode
    : ('code' in source && source.code ? source.code : null)
  if (!isSftpErrorCode(code)) return null
  const params = ('errorParams' in source && source.errorParams) || ('params' in source && source.params) || {}
  return { code, params: params && typeof params === 'object' ? params : {} }
}

/**
 * 将 SFTP 本地路径错误码转为用户可见文案
 * @param {(key: string, params?: Record<string, string|number>) => string} t i18n 翻译函数
 * @param {unknown} source IPC 结果、Error 或含 errorCode 的对象
 * @returns {string} 用户可见文案；非路径错误码时返回空字符串
 */
export function formatSftpPathError(t, source) {
  const extracted = extractSftpError(source)
  if (!extracted) return ''
  const { code, params } = extracted
  const hint = t('sftp.pathErrors.allowedRootsHint')
  const kindKey = params.kind ? `sftp.pathKind.${params.kind}` : ''
  const kindLabel = kindKey ? t(kindKey) : ''
  const base = { hint, kindLabel }

  switch (code) {
    case SFTP_ERROR.LOCAL_FILE_PATH_DENIED:
      return t('sftp.pathErrors.localFileDenied', base)
    case SFTP_ERROR.LOCAL_DIR_PATH_DENIED:
      return t('sftp.pathErrors.localDirDenied', base)
    case SFTP_ERROR.INVALID_FILENAME:
      return t('sftp.pathErrors.invalidFilename', { kindLabel })
    case SFTP_ERROR.PATH_ESCAPE_TARGET:
      return t('sftp.pathErrors.pathEscapeTarget', { kindLabel })
    case SFTP_ERROR.LOG_DIR_DENIED:
      return t('sftp.pathErrors.logDirDenied', { hint })
    default:
      return ''
  }
}

/**
 * SFTP 操作失败时的用户可见错误（路径错误走 i18n，其余保留原始 error 文本）
 * @param {(key: string, params?: Record<string, string|number>) => string} t i18n 翻译函数
 * @param {unknown} source IPC 结果、Error 或含 errorCode 的对象
 * @param {string} [fallback] 无 error / 非路径错误时的回退文案，如 "操作失败"
 * @returns {string} 用户可见文案
 */
export function formatSftpOperationError(t, source, fallback = '') {
  const pathMsg = formatSftpPathError(t, source)
  if (pathMsg) return pathMsg
  if (source && typeof source === 'object' && 'error' in source && source.error) {
    return String(source.error)
  }
  if (source instanceof Error && source.message) return source.message
  return fallback
}
