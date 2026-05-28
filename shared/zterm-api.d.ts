/**
 * Preload 暴露的 window.zterm API 契约（preload 与渲染进程共用）
 */
import type { IpcResult } from './ipc.js'

/** 进度信息 */
export interface ZTermProgress {
  type?: string
  transferred?: number
  total?: number
  percent?: number
  file?: string
}

/** 凭据获取原因 */
export type VaultGetReason =
  | 'invalidSavedId'
  | 'encryptionUnavailable'
  | 'notInVault'
  | 'decryptFailed'

/** 凭据获取内容 */
export type VaultGetContent =
  | { found: false; reason: VaultGetReason }
  | { found: true; password?: string; privateKey?: string; passphrase?: string }

/** 窗口控制 API */
export interface ZTermWindowApi {
  minimize: () => void
  maximize: () => void
  close: () => void
  setBackgroundColor: (hex: string) => void
  onMaximized: (cb: (v: boolean) => void) => void
  isMaximized: () => Promise<IpcResult<{ maximized: boolean }>>
  zoomWheelStep: (deltaY: number) => void
}

/** SSH 连接 API */
export interface ZTermSshApi {
  connect: (id: string, config: Record<string, unknown>) => Promise<IpcResult>
  disconnect: (id: string) => Promise<IpcResult>
  sendData: (id: string, data: string, encoding?: string) => void
  resize: (id: string, cols: number, rows: number) => void
  onData: (id: string, cb: (data: string) => void) => () => void
  onClose: (id: string, cb: () => void) => () => void
}

/** SFTP 连接 API */
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

/** Telnet 连接 API */
export interface ZTermTelnetApi {
  connect: (id: string, config: Record<string, unknown>) => Promise<IpcResult>
  disconnect: (id: string) => Promise<IpcResult>
  sendData: (id: string, data: string, encoding?: string) => void
  onData: (id: string, cb: (data: string) => void) => () => void
  onClose: (id: string, cb: () => void) => () => void
}

/** 串口连接 API */
export interface ZTermSerialApi {
  listPorts: () => Promise<IpcResult<{ ports: unknown[] }>>
  connect: (id: string, config: Record<string, unknown>) => Promise<IpcResult>
  disconnect: (id: string) => Promise<IpcResult>
  sendData: (id: string, data: string, encoding?: string) => void
  onData: (id: string, cb: (data: string) => void) => () => void
  onClose: (id: string, cb: () => void) => () => void
}

/** 凭据 API */
export interface ZTermCredentialsApi {
  isAvailable: () => Promise<IpcResult<{ available: boolean }>>
  get: (savedId: string) => Promise<IpcResult<VaultGetContent>>
  sync: (savedId: string, partial: Record<string, unknown>) => Promise<IpcResult>
  remove: (savedId: string) => Promise<IpcResult>
  duplicate: (fromId: string, toId: string) => Promise<IpcResult>
  clearAll: () => Promise<IpcResult>
}

/** 本地路径 API */
export interface ZTermPathsApi {
  getDownloadsPath: () => Promise<IpcResult<{ path: string }>>
  chooseDirectory: () => Promise<IpcResult<{ path?: string; canceled?: boolean }>>
  validateLogDirectory: (dir: string) => Promise<IpcResult>
  validateLocalFilePath: (filePath: string, kind?: string) => Promise<IpcResult>
  getPathForFile: (file: File) => string
}

/** 保存 API */
export interface ZTermSaveApi {
  terminalOutput: (defaultName: string, text: string) => Promise<IpcResult<{ canceled?: boolean }>>
  jsonExport: (defaultName: string, jsonText: string) => Promise<IpcResult<{ canceled?: boolean }>>
}

/** 日志 API */
export interface ZTermLogApi {
  write: (logDir: string, sessionId: string, data: string) => void
  append: (logDir: string, sessionId: string, data: string) => void
}

/** 其它 API */
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
