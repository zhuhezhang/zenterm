import { INVALID_LABEL_CHARS } from '../../shared/safeFileName.js'

/**
 * 日志文件主名：非法字符替换为下划线（主进程 log:write / log:append）
 * @param {string} raw 原始文件名
 * @returns {string} 安全文件名
 */
export function sanitizeLogFileStem(raw) {
  return String(raw ?? '').replace(INVALID_LABEL_CHARS, '_').trim() || 'session'
}
