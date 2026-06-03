import { INVALID_LABEL_CHARS } from '../../shared/others.js'

/** 日志文件主名：非法字符替换为下划线（log:write / log:append） */
export function sanitizeLogFileStem(raw: unknown) {
  return String(raw ?? '').replace(INVALID_LABEL_CHARS, '_').trim() || 'session'
}
