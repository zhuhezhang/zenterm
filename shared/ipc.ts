/**
 * 主进程 ↔ 渲染进程 IPC 统一响应：{ success, content }；失败时另含 errorKnown
 * 前后端共用类型；主进程构造/识别见 electron/lib/ipcResponse.ts（ipcOk、isIpcError 等）
 */

/** IPC content 允许的 JSON 值（含结构化对象，如 SftpEntry[]、SerialPortInfo[]） */
export type IpcJsonValue =
  | string
  | number
  | boolean
  | null
  | IpcJsonValue[]
  | { [key: string]: IpcJsonValue }
  | object

/** IPC 响应 content 字段 */
export type IpcContent = {
  error?: string
  errorParams?: Record<string, string | number>
} & Record<string, IpcJsonValue | undefined>

/** IPC 成功响应 */
export interface IpcOk<T extends IpcContent = IpcContent> {
  success: true
  content: T
}

/** IPC 失败响应 */
export interface IpcFail<T extends IpcContent = IpcContent> {
  success: false
  errorKnown: boolean
  content: T & { error: string }
}

/** IPC 响应结果 */
export type IpcResult<T extends IpcContent = IpcContent> = IpcOk<T> | IpcFail<T>

/** 带 i18n 错误码的 Error（主进程路径策略等 throw，ipcFailFromThrown 识别） */
export interface IpcError extends Error {
  ipcCode: string
  ipcParams: Record<string, string | number>
  ipcKnown: boolean
}
