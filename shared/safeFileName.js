/** 标签/分组名与日志文件名的非法字符（与历史 INVALID_LABEL_CHARS 行为一致） */
export const INVALID_LABEL_CHARS = /[\/\\:*?"\u003c\u003e|\x00]/

/**
 * 是否包含非法标签字符
 * @param {string} value
 * @returns {boolean}
 */
export function hasInvalidLabelChars(value) {
  return INVALID_LABEL_CHARS.test(String(value ?? ''))
}

/**
 * 过滤文件名非法字符，保留可读标签（终端导出等）
 * @param {string} raw 原始文件名
 * @returns {string} 安全文件名
 */
export function safeFileToken(raw) {
  return (raw || 'session')
    .replace(INVALID_LABEL_CHARS, '')
    .replace(/\s+/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .trim() || 'session'
}

/**
 * 日志文件主名：非法字符替换为下划线（主进程 log:write / log:append）
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeLogFileStem(raw) {
  return String(raw ?? '').replace(INVALID_LABEL_CHARS, '_').trim() || 'session'
}
