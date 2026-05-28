import type { IpcResult } from './ipc'

export interface ImportError extends Error {
  code: string
  params?: Record<string, string | number>
  ipc?: IpcResult
}

export interface IpcThrownError extends Error {
  errorParams?: Record<string, string | number>
  errorKnown?: boolean
}
