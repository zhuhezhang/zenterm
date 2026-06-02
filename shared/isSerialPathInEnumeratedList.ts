/** 枚举项至少含 path，与 serialport list() / listPorts IPC 一致 */
export type SerialPortListEntry = { path?: string }

/**
 * 串口路径是否落在当前枚举列表中（主进程连接前校验 + 渲染进程表单校验须一致）。
 * Windows 上对 COM 路径不区分大小写。
 */
export function isSerialPathInEnumeratedList(
  requestedPath: string | null | undefined,
  ports: ReadonlyArray<SerialPortListEntry> | null | undefined,
): boolean {
  const req = String(requestedPath ?? '').trim()
  if (!req) return false
  const paths = (ports ?? []).map((p) => p?.path).filter((p): p is string => Boolean(p))
  if (typeof process !== 'undefined' && process.platform === 'win32') {
    const rl = req.toLowerCase()
    return paths.some((p) => p.toLowerCase() === rl)
  }
  return paths.includes(req)
}
