/** 会话类型与树结构领域模型 */

export type SessionType = 'ssh' | 'telnet' | 'serial'

export type SessionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error'

export type BackspaceMode = 'auto' | 'del' | 'bs'

/** localStorage 中已保存的会话 */
export interface SavedSession {
  [key: string]: unknown
  savedId: string
  type: SessionType
  label: string
  group: string
  savedAt?: number
  host?: string
  port?: number
  username?: string
  authType?: string
  enableSftp?: boolean
  password?: string
  privateKey?: string
  passphrase?: string
  path?: string
  baudRate?: number
  dataBits?: number
  stopBits?: number
  parity?: string
  encoding?: string
  backspaceMode?: string
}

/** 顶部标签页中的活跃会话 */
export interface ActiveSession extends SavedSession {
  id: string
  status?: SessionStatus | string
  sftpOpen?: boolean
  sftpConnected?: boolean
  sftpReady?: boolean
  remotePath?: string
  errorMessage?: string
}

/** 连接对话框 / 启动会话 / 导入等使用的配置（已保存或临时） */
export type SessionConfig = Partial<SavedSession> & {
  type?: SessionType | string
  id?: string
  status?: string
  [key: string]: unknown
}

/** 连接对话框表单字段（字符串/数值混用，便于 input 绑定） */
export interface SessionFormValues {
  label?: string
  group?: string
  host?: string
  port?: string | number
  username?: string
  authType?: string
  password?: string
  privateKey?: string
  passphrase?: string
  enableSftp?: boolean
  encoding?: string
  backspaceMode?: string
  path?: string
  baudRate?: string | number
  dataBits?: string | number
  stopBits?: string | number
  parity?: string
  savedId?: string
  type?: SessionType | string
}

export interface SessionTreeSessionNode {
  id: string
  type: 'session'
  name: string
  session: SavedSession
}

export interface SessionTreeGroupNode {
  id: string
  type: 'group'
  name: string
  path: string
  children: SessionTreeNode[]
}

export type SessionTreeNode = SessionTreeSessionNode | SessionTreeGroupNode

export interface FlattenedTreeItem {
  id: string
  type: string
  node: SessionTreeNode
}

export interface CredentialDialogState {
  username?: string
  password?: string
  privateKey?: string
  passphrase?: string
  session: SessionConfig
}

export type TerminalTextGetter = () => string
export type TerminalClearFn = () => void

/** 会话分组/标签名校验错误码 */
export type SessionGroupLabelError =
  | 'groupSlashStart'
  | 'groupSlashEnd'
  | 'groupIllegalChars'
  | 'labelIllegalChars'

/** pickSessionStorageFields 写入 localStorage 的字段形状 */
export type PickedSessionFields = Omit<SavedSession, 'savedId' | 'savedAt'> & {
  type: SessionType
  label: string
  group: string
}
