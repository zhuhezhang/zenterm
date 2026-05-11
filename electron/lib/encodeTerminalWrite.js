import iconv from 'iconv-lite'
import { normalizeTerminalEncoding } from '../../shared/terminalEncodings.js'

/**
 * 将用户输入的 Unicode 字符串编码为发往远端终端的字节
 * @param {string} str 字符串
 * @param {string} [encoding] 编码
 * @returns {Buffer} 编码后的字节
 */
export function stringToTerminalBytes(str, encoding) {
  const enc = normalizeTerminalEncoding(encoding)
  if (enc === 'utf-8') return Buffer.from(str, 'utf8')
  try {
    if (iconv.encodingExists(enc)) return iconv.encode(str, enc)
  } catch {
    // fall through
  }
  return Buffer.from(str, 'utf8')
}
