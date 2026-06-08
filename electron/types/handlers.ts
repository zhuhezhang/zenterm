/** 主进程 IPC handler 内部类型（不跨进程共享） */
import type { BrowserWindow } from 'electron'
import type { Worker } from 'worker_threads'
import type { SftpWorkerCmdResultMessage } from './workerMessages.js'

/** 获取主窗口的函数类型 */
export type MainWindowGetter = () => BrowserWindow | null | undefined

/** SFTP 会话状态 */
export interface SftpSessionState {
  /** 子进程 Worker */
  worker: Worker | null
  /** 等待的请求 */
  pending: Map<number, (msg: SftpWorkerCmdResultMessage) => void>
  /** 请求序列号 */
  reqSeq: number
  /** 是否已关闭 */
  isClosed: boolean
}

/** SSH 会话状态 */
export interface SshSessionState {
  /** 子进程 Worker */
  worker: Worker
  /** 是否已关闭 */
  isClosed: boolean
}
