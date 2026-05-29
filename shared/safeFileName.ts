/** 标签名非法字符（含 /） */
export const INVALID_LABEL_CHARS = new RegExp(
  `[/\\\\:*?"\\u003c\\u003e|${String.fromCharCode(0)}]`,
)

/** 分组名非法字符（/ 为路径分隔符，由首尾规则单独校验） */
export const INVALID_GROUP_CHARS = new RegExp(
  `[\\\\:*?"\\u003c\\u003e|${String.fromCharCode(0)}]`,
)

export function hasInvalidLabelChars(value: unknown) {
  return INVALID_LABEL_CHARS.test(String(value ?? ''))
}

export function hasInvalidGroupChars(value: unknown) {
  return INVALID_GROUP_CHARS.test(String(value ?? ''))
}

/** 过滤文件名非法字符，保留可读标签（终端导出等） */
export function safeFileToken(raw: unknown) {
  return String(raw || 'session')
    .replace(INVALID_LABEL_CHARS, '')
    .replace(/\s+/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .trim() || 'session'
}

/** 日志文件主名：非法字符替换为下划线 */
export function sanitizeLogFileStem(raw: unknown) {
  return String(raw ?? '').replace(INVALID_LABEL_CHARS, '_').trim() || 'session'
}
