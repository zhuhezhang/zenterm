/**
 * 主进程 ↔ 渲染进程 IPC 统一响应：{ success, content }；失败时另含 errorKnown
 * 前后端共用：主进程 ipcOk/ipcFail、渲染进程 window.zterm.invoke 返回值、formatIpcError 等
 */

/** IPC 响应 content 字段 */
export interface IpcContent {
  [key: string]: unknown
  error?: string
  errorParams?: Record<string, string | number>
}

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

export function isIpcError(e: unknown): e is IpcError {
  return !!e && typeof e === 'object' && 'ipcCode' in e && typeof (e as IpcError).ipcCode === 'string'
}
