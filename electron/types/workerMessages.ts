/** 主进程 ↔ Worker 线程消息类型（不跨 IPC 到渲染进程） */
import type { SftpEntry } from '../../shared/others.js'

/** SSH Worker 主进程 → Worker 入站消息 */
export type SshWorkerInboundMessage =
  | { type: 'HOST_VERIFY_RESULT'; reqId: number; ok: boolean }
  | { type: 'WRITE'; data: string | Buffer | ArrayLike<number> }
  | { type: 'RESIZE'; rows: number; cols: number }
  | { type: 'DISCONNECT' }

/** SSH Worker → 主进程出站消息 */
export type SshWorkerOutboundMessage =
  | { type: 'HOST_VERIFY'; reqId: number; host?: string; port: number; keyBase64: string }
  | { type: 'CONNECT_FAILED'; error: string }
  | { type: 'CLOSED' }
  | { type: 'READY' }
  | { type: 'OUTPUT'; data: string }

/** SFTP Worker 命令载荷 */
export type SftpWorkerCmdPayload =
  | { cmd: 'LIST'; remotePath: string }
  | { cmd: 'DOWNLOAD'; remotePath: string; localPath: string }
  | { cmd: 'DOWNLOAD_DIR'; remoteDir: string; localDir: string }
  | { cmd: 'UPLOAD'; localPath: string; remotePath: string }
  | { cmd: 'MKDIR'; remotePath: string }
  | { cmd: 'DELETE'; remotePath: string }
  | { cmd: 'RENAME'; oldPath: string; newPath: string }

/** SFTP Worker 主进程 → Worker 入站消息 */
export type SftpWorkerInboundMessage =
  | { type: 'HOST_VERIFY_RESULT'; reqId: number; ok: boolean }
  | { type: 'DISCONNECT' }
  | ({ type: 'CMD'; reqId: number } & SftpWorkerCmdPayload)

/** SFTP Worker CMD_RESULT 消息 */
export interface SftpWorkerCmdResultMessage {
  type: 'CMD_RESULT'
  reqId: number
  success: boolean
  error?: string
  errorParams?: Record<string, string | number>
  errorKnown?: boolean
  items?: SftpEntry[]
}

/** SFTP 传输进度 */
export interface SftpWorkerProgress {
  type?: string
  transferred?: number
  total?: number
  percent?: number
  file?: string
}

/** SFTP Worker → 主进程出站消息 */
export type SftpWorkerOutboundMessage =
  | { type: 'HOST_VERIFY'; reqId: number; host?: string; port: number; keyBase64: string }
  | { type: 'CONNECT_FAILED'; error: string; errorParams?: Record<string, string | number> }
  | { type: 'READY' }
  | { type: 'CLOSED' }
  | { type: 'PROGRESS'; progress: SftpWorkerProgress }
  | SftpWorkerCmdResultMessage
