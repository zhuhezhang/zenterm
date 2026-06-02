/** 主进程 IPC handler 内部类型（不跨进程共享） */
import type {
  BrowserWindow,
  FileFilter,
  IpcMain,
  IpcMainEvent,
  IpcMainInvokeEvent,
  WebContents,
} from 'electron'
import type { Worker } from 'worker_threads'
import type { SftpWorkerCmdResultMessage } from '../../shared/workerMessages.js'

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
  pending: Map<number, (msg: SftpWorkerCmdResultMessage) => void>
  reqSeq: number
  isClosed: boolean
}

export interface SshSessionState {
  worker: Worker
  isClosed: boolean
}
