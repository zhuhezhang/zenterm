import type { IpcResult } from './zterm'

export interface ImportError extends Error {
  code: string
  params?: Record<string, string | number>
  ipc?: IpcResult
}

export interface IpcThrownError extends Error {
  errorParams?: Record<string, string | number>
  errorKnown?: boolean
}
