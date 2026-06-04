/**
 * 主进程终端编码服务：远端上行编码、下行 Buffer → IPC binary 线。
 * SSH / Telnet / Serial 仅通过本模块处理字节与编码，勿在各 handler 内重复实现。
 */
import iconv from 'iconv-lite'
import { DEFAULT_TERMINAL_ENCODING, normalizeTerminalEncoding } from '../../shared/terminalEncoding.js'

/**
 * Unicode 用户输入 → 按会话编码写入远端/设备的字节
 * @param str 用户输入
 * @param encoding 编码
 * @returns 按会话编码写入远端/设备的字节
 */
export function encodeUnicodeToTerminalBytes(str: string, encoding?: string) {
  const enc = normalizeTerminalEncoding(encoding)
  if (enc === DEFAULT_TERMINAL_ENCODING) return Buffer.from(str, 'utf8')
  try {
    if (iconv.encodingExists(enc)) return iconv.encode(str, enc)
  } catch {
    // fall through
  }
  return Buffer.from(str, 'utf8')
}

/**
 * Node Buffer → 发往渲染进程的 binary 线字符串（与 ssh/telnet/serial 输出一致）
 * @param data 数据
 * @returns 发往渲染进程的 binary 线字符串
 */
export function bufferToBinaryWire(data: Buffer | Uint8Array | string) {
  if (typeof data === 'string') return data
  if (Buffer.isBuffer(data)) return data.toString('binary')
  return Buffer.from(data).toString('binary')
}

/**
 * 渲染进程 IPC 上行：xterm 字符串或 Buffer → 写入通道的 Buffer
 * @param data 数据
 * @param encoding 编码
 * @returns 写入通道的 Buffer
 */
export function encodeOutgoingTerminalData(data: string | Buffer | Uint8Array | unknown, encoding?: string) {
  if (typeof data === 'string') return encodeUnicodeToTerminalBytes(data, encoding)
  if (Buffer.isBuffer(data)) return data
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  return Buffer.from(data as ArrayLike<number>)
}
