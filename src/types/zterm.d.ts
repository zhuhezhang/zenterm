/** Preload 暴露的 window.zterm API（与 electron/preload.cjs 对齐） */

export interface ZTermProgress {
  type?: string
  transferred?: number
  total?: number
}

export interface ZTermWindowApi {
  minimize: () => void
  maximize: () => void
  close: () => void
  setBackgroundColor: (hex: string) => void
  onMaximized: (cb: (v: boolean) => void) => void
  isMaximized: () => Promise<boolean>
}

export interface ZTermCredentialsApi {
  isAvailable: () => Promise<boolean>
  get: (savedId: string) => Promise<Record<string, unknown>>
  sync: (savedId: string, partial: Record<string, unknown>) => Promise<unknown>
  remove: (savedId: string) => Promise<unknown>
  duplicate: (fromId: string, toId: string) => Promise<unknown>
  clearAll: () => Promise<unknown>
}

export interface ZTermConnectResult {
  success: boolean
  error?: string
}

export interface ZTermSshApi {
  connect: (id: string, config: Record<string, unknown>) => Promise<ZTermConnectResult>
  disconnect: (id: string) => Promise<unknown>
  sendData: (id: string, data: string, encoding?: string) => void
  resize: (id: string, cols: number, rows: number) => void
  onData: (id: string, cb: (data: string) => void) => () => void
  onClose: (id: string, cb: () => void) => () => void
}

export interface ZTermSftpApi {
  connect: (id: string, config: Record<string, unknown>) => Promise<ZTermConnectResult>
  disconnect: (id: string) => Promise<unknown>
  list: (id: string, remotePath: string) => Promise<unknown>
  download: (id: string, remotePath: string, localPath: string) => Promise<unknown>
  downloadDir: (id: string, remoteDir: string, localDir: string) => Promise<unknown>
  upload: (id: string, localPath: string, remotePath: string) => Promise<unknown>
  mkdir: (id: string, remotePath: string) => Promise<unknown>
  delete: (id: string, remotePath: string) => Promise<unknown>
  rename: (id: string, oldPath: string, newPath: string) => Promise<unknown>
  onProgress: (id: string, cb: (progress: ZTermProgress) => void) => () => void
}

export interface ZTermTelnetApi {
  connect: (id: string, config: Record<string, unknown>) => Promise<ZTermConnectResult>
  disconnect: (id: string) => Promise<unknown>
  sendData: (id: string, data: string, encoding?: string) => void
  onData: (id: string, cb: (data: string) => void) => () => void
  onClose: (id: string, cb: () => void) => () => void
}

export interface ZTermSerialApi {
  listPorts: () => Promise<unknown>
  connect: (id: string, config: Record<string, unknown>) => Promise<ZTermConnectResult>
  disconnect: (id: string) => Promise<unknown>
  sendData: (id: string, data: string, encoding?: string) => void
  onData: (id: string, cb: (data: string) => void) => () => void
  onClose: (id: string, cb: () => void) => () => void
}

export interface ZTermLogApi {
  write: (logDir: string, sessionId: string, data: string) => void
  append: (logDir: string, sessionId: string, data: string) => void
}

export interface ZTermApi {
  getDownloadsPath: () => string
  setUiLanguage: (uiLanguage: 'zh' | 'en') => void
  chooseDirectory: () => Promise<string | null>
  validateLogDirectory: (dir: string) => Promise<{
    success: boolean
    error?: string
    errorParams?: Record<string, string | number>
    errorKnown?: boolean
  }>
  validateLocalFilePath: (filePath: string, kind?: string) => Promise<{
    success: boolean
    error?: string
    errorParams?: Record<string, string | number>
    errorKnown?: boolean
  }>
  saveTerminalOutput: (defaultName: string, text: string) => Promise<{
    success: boolean
    canceled?: boolean
    error?: string
    errorParams?: Record<string, string | number>
    errorKnown?: boolean
  }>
  saveJsonExport: (defaultName: string, jsonText: string) => Promise<{
    success: boolean
    canceled?: boolean
    error?: string
    errorParams?: Record<string, string | number>
    errorKnown?: boolean
  }>
  getPathForFile: (file: File) => string
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
