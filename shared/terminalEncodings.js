/**
 * 终端会话字符编码规范名（与 TextDecoder / iconv-lite 命名对齐）。
 * 前后端共用：SSH/Telnet/Serial 上行编码与下行解码前的规范化。
 */

/** 默认编码 */
export const DEFAULT_TERMINAL_ENCODING = 'utf-8'

/**
 * 规范编码名，供解码器与 iconv 使用
 * @param {string} [enc] 编码
 * @returns {string} 规范后的编码
 */
export function normalizeTerminalEncoding(enc) {
  const e = (enc && String(enc).trim().toLowerCase()) || DEFAULT_TERMINAL_ENCODING
  if (e === 'utf8') return 'utf-8'
  if (e === 'cp936') return 'gbk'
  if (e === 'gb_2312' || e === 'gb2312') return 'gbk'
  return e
}
