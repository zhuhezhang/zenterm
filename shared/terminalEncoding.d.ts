/** 默认编码 */
export const DEFAULT_TERMINAL_ENCODING: string

/**
 * 规范编码名，供 TextDecoder / iconv-lite 使用
 * @param enc 编码名
 * @returns 规范编码名
 */
export function normalizeTerminalEncoding(enc?: string): string

/**
 * 主进程 `Buffer#toString('binary')` / IPC 传来的「每字节一码元」字符串 → Uint8Array
 * @param binary 「每字节一码元」字符串
 * @returns Uint8Array 字节数组
 */
export function uint8ArrayFromBinaryWire(binary: string): Uint8Array
