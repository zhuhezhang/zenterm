/** 渲染进程 IPC 错误包装（底层契约见 shared/ipc.ts） */
import type { IpcResult } from '../../shared/ipc'

export interface ImportError extends Error {
  code: string
  params?: Record<string, string | number>
  ipc?: IpcResult
}

export interface IpcThrownError extends Error {
  errorParams?: Record<string, string | number>
  errorKnown?: boolean
}
