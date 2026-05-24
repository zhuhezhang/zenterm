import {
  DEFAULT_TERMINAL_ENCODING,
  normalizeTerminalEncoding,
} from '../../shared/terminalEncodings.js'

export { DEFAULT_TERMINAL_ENCODING, normalizeTerminalEncoding }

/** 编码列表，用于连接界面选择编码 */
export const TERMINAL_ENCODING_OPTIONS = [
  { value: DEFAULT_TERMINAL_ENCODING, label: 'UTF-8' },
  { value: 'gbk', label: 'GBK / CP936（简体中文）' },
  { value: 'gb18030', label: 'GB18030（中文国标）' },
  { value: 'gb2312', label: 'GB2312（按 GBK 处理）' },
  { value: 'big5', label: 'Big5（繁体中文）' },
  { value: 'utf-16le', label: 'UTF-16 LE' },
  { value: 'latin1', label: 'Latin-1 (ISO-8859-1)' },
]

const decoderCache = new Map()

/**
 * 获取 TextDecoder（带缓存）；无效编码时退回 UTF-8
 * @param {string} encoding 编码
 * @returns {TextDecoder} TextDecoder 实例
 */
function getTextDecoder(encoding) {
  const key = normalizeTerminalEncoding(encoding)
  if (decoderCache.has(key)) return decoderCache.get(key)
  let dec
  try {
    dec = new TextDecoder(key, { fatal: false, ignoreBOM: true })
  } catch {
    dec = new TextDecoder(DEFAULT_TERMINAL_ENCODING, { fatal: false, ignoreBOM: true })
  }
  decoderCache.set(key, dec)
  return dec
}

/**
 * 主进程经 `binary` 字符串传来的字节流 → Unicode 字符串（供 xterm 显示）
 * @param {string} binary 每字节一码元的 Latin-1 风格字符串
 * @param {string} [encoding] 编码
 * @returns {string} 解码后的字符串
 */
export function decodeTerminalBinaryString(binary, encoding) {
  if (binary == null || binary === '') return ''
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 0xff
  try {
    return getTextDecoder(encoding).decode(bytes)
  } catch {
    return new TextDecoder(DEFAULT_TERMINAL_ENCODING, { fatal: false }).decode(bytes)
  }
}
