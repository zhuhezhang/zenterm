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

/** SFTP Worker 主进程 → Worker 入站消息（cmd 字段区分操作） */
export type SftpWorkerInboundMessage = {
  cmd: string
  id?: string
  remotePath?: string
  localPath?: string
  remoteDir?: string
  localDir?: string
  oldPath?: string
  newPath?: string
  [key: string]: unknown
}

/** SFTP Worker → 主进程出站消息 */
export type SftpWorkerOutboundMessage =
  | { type: 'READY' }
  | { type: 'LIST_RESULT'; items: SftpEntry[] }
  | { type: 'PROGRESS'; transferred?: number; total?: number; percent?: number; file?: string; progressType?: string }
  | { type: 'ERROR'; error: string }
  | { type: 'CLOSED' }

/** SFTP 目录项（主进程 / 渲染进程共用） */
export interface SftpEntry {
  name: string
  type: 'd' | '-' | string
  path?: string
  isDir?: boolean
  size?: number
  modifyTime?: number
  mtime?: number
}
