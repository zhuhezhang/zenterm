/** Preload 暴露的 window.zterm API（与 electron/preload.cjs 对齐），用这份声明让 App.tsx 等能写 window.zterm.xxx 并有类型提示 */

export interface IpcContent {
  [key: string]: unknown
  error?: string
  errorParams?: Record<string, string | number>
}

export interface IpcOk<T extends IpcContent = IpcContent> {
  success: true
  content: T
}

export interface IpcFail<T extends IpcContent = IpcContent> {
  success: false
  errorKnown: boolean
  content: T & { error: string }
}

export type IpcResult<T extends IpcContent = IpcContent> = IpcOk<T> | IpcFail<T>

export interface ZTermProgress {
  type?: string
  transferred?: number
  total?: number
  percent?: number
  file?: string
}

export interface ZTermWindowApi {
  minimize: () => void
  maximize: () => void
  close: () => void
  setBackgroundColor: (hex: string) => void
  onMaximized: (cb: (v: boolean) => void) => void
  isMaximized: () => Promise<IpcResult<{ maximized: boolean }>>
  /** macOS：Cmd+滚轮单步缩放 */
  zoomWheelStep: (deltaY: number) => void
}

export type VaultGetReason =
  | 'invalidSavedId'
  | 'encryptionUnavailable'
  | 'notInVault'
  | 'decryptFailed'

export type VaultGetContent =
  | { found: false; reason: VaultGetReason }
  | { found: true; password?: string; privateKey?: string; passphrase?: string }

export interface ZTermCredentialsApi {
  isAvailable: () => Promise<IpcResult<{ available: boolean }>>
  get: (savedId: string) => Promise<IpcResult<VaultGetContent>>
  sync: (savedId: string, partial: Record<string, unknown>) => Promise<IpcResult>
  remove: (savedId: string) => Promise<IpcResult>
  duplicate: (fromId: string, toId: string) => Promise<IpcResult>
  clearAll: () => Promise<IpcResult>
}

export interface ZTermSshApi {
  connect: (id: string, config: Record<string, unknown>) => Promise<IpcResult>
  disconnect: (id: string) => Promise<IpcResult>
  sendData: (id: string, data: string, encoding?: string) => void
  resize: (id: string, cols: number, rows: number) => void
  onData: (id: string, cb: (data: string) => void) => () => void
  onClose: (id: string, cb: () => void) => () => void
}

export interface ZTermSftpApi {
  connect: (id: string, config: Record<string, unknown>) => Promise<IpcResult>
  disconnect: (id: string) => Promise<IpcResult>
  list: (id: string, remotePath: string) => Promise<IpcResult<{ items: unknown[] }>>
  download: (id: string, remotePath: string, localPath: string) => Promise<IpcResult>
  downloadDir: (id: string, remoteDir: string, localDir: string) => Promise<IpcResult>
  upload: (id: string, localPath: string, remotePath: string) => Promise<IpcResult>
  mkdir: (id: string, remotePath: string) => Promise<IpcResult>
  delete: (id: string, remotePath: string) => Promise<IpcResult>
  rename: (id: string, oldPath: string, newPath: string) => Promise<IpcResult>
  onProgress: (id: string, cb: (progress: ZTermProgress) => void) => () => void
}

export interface ZTermTelnetApi {
  connect: (id: string, config: Record<string, unknown>) => Promise<IpcResult>
  disconnect: (id: string) => Promise<IpcResult>
  sendData: (id: string, data: string, encoding?: string) => void
  onData: (id: string, cb: (data: string) => void) => () => void
  onClose: (id: string, cb: () => void) => () => void
}

export interface ZTermSerialApi {
  listPorts: () => Promise<IpcResult<{ ports: unknown[] }>>
  connect: (id: string, config: Record<string, unknown>) => Promise<IpcResult>
  disconnect: (id: string) => Promise<IpcResult>
  sendData: (id: string, data: string, encoding?: string) => void
  onData: (id: string, cb: (data: string) => void) => () => void
  onClose: (id: string, cb: () => void) => () => void
}

export interface ZTermLogApi {
  write: (logDir: string, sessionId: string, data: string) => void
  append: (logDir: string, sessionId: string, data: string) => void
}

export interface ZTermPathsApi {
  getDownloadsPath: () => Promise<IpcResult<{ path: string }>>
  chooseDirectory: () => Promise<IpcResult<{ path?: string; canceled?: boolean }>>
  validateLogDirectory: (dir: string) => Promise<IpcResult>
  validateLocalFilePath: (filePath: string, kind?: string) => Promise<IpcResult>
  getPathForFile: (file: File) => string
}

export interface ZTermSaveApi {
  terminalOutput: (defaultName: string, text: string) => Promise<IpcResult<{ canceled?: boolean }>>
  jsonExport: (defaultName: string, jsonText: string) => Promise<IpcResult<{ canceled?: boolean }>>
}

export interface ZTermOthersApi {
  setUiLanguage: (uiLanguage: 'zh' | 'en') => void
}

export interface ZTermApi {
  paths: ZTermPathsApi
  save: ZTermSaveApi
  others: ZTermOthersApi
  window: ZTermWindowApi
  credentials: ZTermCredentialsApi
  log: ZTermLogApi
  ssh: ZTermSshApi
  sftp: ZTermSftpApi
  telnet: ZTermTelnetApi
  serial: ZTermSerialApi
}

declare global {
  interface Window {
    zterm?: ZTermApi
  }
}

export {}
