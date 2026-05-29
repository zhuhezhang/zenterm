/**
 * 主进程 → 渲染进程 IPC 统一响应：{ success, content }；失败时另含 errorKnown
 */
import type { IpcContent, IpcError, IpcFail, IpcOk, IpcResult } from '../../shared/ipc.js'

export type { IpcContent, IpcError, IpcFail, IpcOk, IpcResult }

/**
 * 判断是否为 ipc 错误
 * @param e 未知对象
 * @returns 是否为 ipc 错误
 */
export function isIpcError(e: unknown): e is IpcError {
  return (
    !!e &&
    typeof e === 'object' &&
    'ipcCode' in e &&
    typeof (e as IpcError).ipcCode === 'string'
  )
}

/**
 * 成功响应（前端调用后端函数成功时，后端返回的成功响应）
 * @param content 响应内容
 * @returns 成功响应对象
 */
export function ipcOk<T extends IpcContent = IpcContent>(content: T = {} as T): IpcOk<T> {
  return { success: true, content: { ...content } }
}

/**
 * 失败响应（前端调用后端函数失败时，后端返回的错误响应）
 * @param error 错误码（errorKnown 为 true）或库/系统原始 message（errorKnown 为 false）
 * @param errorKnown 是否已知 i18n 错误码；未传时默认为 false（前端不翻译）
 * @param params 错误参数（如{name: '张三'}），仅 errorKnown 为 true 时写入 errorParams
 * @param contentExtra 并入 content 的额外字段（如 ports: []）
 * @returns 失败响应对象
 */
export function ipcFail<T extends IpcContent = IpcContent>(
  error: string,
  errorKnown = false,
  params?: Record<string, string | number>,
  contentExtra?: IpcContent,
): IpcFail<T> {
  const content = { error, ...(contentExtra || {}) } as T & { error: string }
  if (errorKnown && params && Object.keys(params).length) {
    content.errorParams = params
  }
  return { success: false, errorKnown, content }
}

/**
 * 构造带错误码的 Error（路径策略等 throw 用，后续 ipcFailFromThrown 转为 IPC 响应）
 * @param code 错误码
 * @param params 错误参数（如{name: '张三'}）
 * @returns 错误对象
 */
export function createIpcError(code: string, params?: Record<string, string | number>): IpcError {
  const err = new Error(code) as IpcError
  err.ipcCode = code
  err.ipcParams = params || {}
  err.ipcKnown = true
  return err
}

/**
 * 从 throw 的 Error 转为 IPC 响应
 * @param e 错误对象
 * @returns 失败响应
 */
export function ipcFailFromThrown(e: unknown): IpcFail {
  if (isIpcError(e)) {
    return ipcFail(e.ipcCode, e.ipcKnown !== false, e.ipcParams)
  }
  const msg = e instanceof Error ? e.message : String(e ?? '')
  return ipcFail(msg, false)
}
