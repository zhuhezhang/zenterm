/**
 * SFTP / 本地路径策略错误码（主进程、Worker、渲染进程共用）
 */

/** 路径相关错误码 */
export const SFTP_ERROR = {
  LOCAL_FILE_PATH_DENIED: 'LOCAL_FILE_PATH_DENIED',
  LOCAL_DIR_PATH_DENIED: 'LOCAL_DIR_PATH_DENIED',
  INVALID_FILENAME: 'INVALID_FILENAME',
  PATH_ESCAPE_TARGET: 'PATH_ESCAPE_TARGET',
  LOG_DIR_DENIED: 'LOG_DIR_DENIED',
}

/** 操作类型（用于 i18n 插值，与语言无关） */
export const SFTP_PATH_KIND = {
  DOWNLOAD: 'download',
  UPLOAD: 'upload',
  SFTP: 'sftp',
}

const CODE_SET = new Set(Object.values(SFTP_ERROR))

/**
 * 检查是否为 SFTP_ERROR 中的错误码
 * @param {unknown} code 错误码
 * @returns {code is string} 返回是否为 SFTP_ERROR 中的错误码
 */
export function isSftpErrorCode(code) {
  return typeof code === 'string' && CODE_SET.has(code)
}

/**
 * 创建 SFTP 路径策略异常，仅用于本地路径校验
 * @param {string} code SFTP_ERROR 中的值
 * @param {Record<string, string>} [params] 传给前端的 i18n 参数
 * @returns {Error & { code: string, params?: Record<string, string> }} 路径策略异常
 */
export function createSftpPathError(code, params) {
  const err = new Error(code)
  err.code = code
  if (params) err.params = params
  return err
}

/**
 * 将路径策略异常转为 IPC 载荷（仅错误码，不含中文文案）
 * @param {unknown} e 路径策略异常
 * @returns {{ errorCode: string, errorParams?: Record<string, string> } | { error: string }} IPC 载荷
 */
export function sftpErrorToIpcPayload(e) {
  const code = e && typeof e === 'object' && 'code' in e ? e.code : null
  if (isSftpErrorCode(code)) {
    const payload = { errorCode: code }
    const params = e.params
    if (params && typeof params === 'object') payload.errorParams = params
    return payload
  }
  const message = e instanceof Error ? e.message : String(e ?? '')
  return { error: message || 'Unknown error' }
}
