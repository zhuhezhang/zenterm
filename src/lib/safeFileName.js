import { INVALID_LABEL_CHARS } from '../../shared/safeFileName.js'

/**
 * 是否包含非法标签字符
 * @param {string} value 标签/分组名
 * @returns {boolean} 是否包含非法标签字符
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
