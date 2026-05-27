/**
 * 终端字符编码：规范名与 IPC「binary 线」字节表示（前后端共用，无 Node/DOM 依赖）。
 */

/** 默认编码 */
export const DEFAULT_TERMINAL_ENCODING = 'utf-8'

/**
 * 规范编码名，供 TextDecoder / iconv-lite 使用
 * @param {string} [enc]
 * @returns {string}
 */
export function normalizeTerminalEncoding(enc) {
  const e = (enc && String(enc).trim().toLowerCase()) || DEFAULT_TERMINAL_ENCODING
  if (e === 'utf8') return 'utf-8'
  if (e === 'cp936') return 'gbk'
  if (e === 'gb_2312' || e === 'gb2312') return 'gbk'
  return e
}

/**
 * 主进程 `Buffer#toString('binary')` / IPC 传来的「每字节一码元」字符串 → Uint8Array
 * @param {string} binary
 * @returns {Uint8Array}
 */
export function uint8ArrayFromBinaryWire(binary) {
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 0xff
  return bytes
}
