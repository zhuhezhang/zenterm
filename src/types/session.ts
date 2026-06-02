/** 会话类型与树结构领域模型 */

export type SessionType = 'ssh' | 'telnet' | 'serial'

export type SessionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error'

export type BackspaceMode = 'auto' | 'del' | 'bs'

/** 各会话类型共有的持久化字段 */
export interface SessionBase {
  savedId: string
  label: string
  group: string
  savedAt?: number
  encoding?: string
  backspaceMode?: BackspaceMode | string
}

export interface SshSavedSession extends SessionBase {
  type: 'ssh'
  host?: string
  port?: number
  username?: string
  authType?: string
  enableSftp?: boolean
  password?: string
  privateKey?: string
  passphrase?: string
}

export interface TelnetSavedSession extends SessionBase {
  type: 'telnet'
  host?: string
  port?: number
}

export interface SerialSavedSession extends SessionBase {
  type: 'serial'
  path?: string
  baudRate?: number
  dataBits?: number
  stopBits?: number
  parity?: string
}

/** localStorage 中已保存的会话 */
export type SavedSession = SshSavedSession | TelnetSavedSession | SerialSavedSession

/** 活跃会话在 SavedSession 之上附加的运行时字段 */
export interface ActiveSessionFields {
  id: string
  status?: SessionStatus | string
  sftpOpen?: boolean
  sftpConnected?: boolean
  sftpReady?: boolean
  remotePath?: string
  errorMessage?: string
}

export type ActiveSshSession = SshSavedSession & ActiveSessionFields
export type ActiveTelnetSession = TelnetSavedSession & ActiveSessionFields
export type ActiveSerialSession = SerialSavedSession & ActiveSessionFields

/** 顶部标签页中的活跃会话 */
export type ActiveSession = ActiveSshSession | ActiveTelnetSession | ActiveSerialSession

/** 连接对话框 / 启动会话使用的配置（字段并集，便于表单与 IPC 传参） */
export interface SessionConfig {
  id?: string
  status?: SessionStatus | string
  type?: SessionType | string
  savedId?: string
  savedAt?: number
  label?: string
  group?: string
  encoding?: string
  backspaceMode?: BackspaceMode | string
  host?: string
  port?: number | string
  username?: string
  authType?: string
  enableSftp?: boolean
  password?: string
  privateKey?: string
  passphrase?: string
  path?: string
  baudRate?: number | string
  dataBits?: number | string
  stopBits?: number | string
  parity?: string
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

export type SshPickedFields = Omit<SshSavedSession, 'savedId' | 'savedAt'>
export type TelnetPickedFields = Omit<TelnetSavedSession, 'savedId' | 'savedAt'>
export type SerialPickedFields = Omit<SerialSavedSession, 'savedId' | 'savedAt'>

/** pickSessionStorageFields 写入 localStorage 的字段形状 */
export type PickedSessionFields = SshPickedFields | TelnetPickedFields | SerialPickedFields

/** 导入 JSON 中的原始会话字段（校验前） */
export interface RawImportedSession {
  type?: string
  savedId?: string
  savedAt?: string | number
  group?: string
  label?: string
  host?: string
  path?: string
  port?: string | number
  username?: string
  authType?: string
  enableSftp?: boolean | string | number
  password?: string
  privateKey?: string
  passphrase?: string
  encoding?: string
  backspaceMode?: string
  baudRate?: string | number
  dataBits?: string | number
  stopBits?: string | number
  parity?: string
}

/** 会话连接端点（host 或 serial path） */
export function sessionEndpoint(session: SavedSession | ActiveSession | SessionConfig): string {
  if (session.type === 'serial') {
    return String('path' in session ? session.path ?? '' : '')
  }
  return String('host' in session ? session.host ?? '' : '')
}

/** SSH 会话是否启用 SFTP */
export function sessionHasSftp(session: SavedSession | ActiveSession | SessionConfig): boolean {
  return session.type === 'ssh' && Boolean(session.enableSftp)
}

/** 是否为 SSH 会话（类型守卫） */
export function isSshSession(session: SavedSession | ActiveSession | SessionConfig): session is SshSavedSession | ActiveSshSession {
  return session.type === 'ssh'
}
