import type {
  BrowserWindow,
  FileFilter,
  IpcMain,
  IpcMainEvent,
  IpcMainInvokeEvent,
  WebContents,
} from 'electron'
import type { Worker } from 'worker_threads'

export type MainWindowGetter = () => BrowserWindow | null | undefined

export type { BrowserWindow, IpcMain, IpcMainEvent, IpcMainInvokeEvent, WebContents }

export interface SaveFilePolicyOptions {
  title: string
  defaultName: string
  filters: FileFilter[]
  content: string
  kind: string
}

export interface SftpSessionState {
  worker: Worker | null
  pending: Map<number, (msg: Record<string, unknown>) => void>
  reqSeq: number
  isClosed: boolean
}

export interface SshSessionState {
  worker: Worker
  isClosed: boolean
}
