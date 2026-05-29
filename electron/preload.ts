import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ZTermApi, ZTermProgress } from '../shared/zterm-api.js'

type StreamPrefix = 'ssh' | 'telnet' | 'serial'

/** SSH / Telnet / Serial 共用的流式会话 IPC 桥接 */
function createStreamSessionBridge(prefix: StreamPrefix) {
  const outputChannel = `${prefix}:output`
  const closedChannel = `${prefix}:closed`
  return {
    connect: (id: string, config: Parameters<ZTermApi[typeof prefix]['connect']>[1]) =>
      ipcRenderer.invoke(`${prefix}:connect`, id, config),
    disconnect: (id: string) => ipcRenderer.invoke(`${prefix}:disconnect`, id),
    sendData: (id: string, data: string, encoding?: string) =>
      ipcRenderer.send(`${prefix}:data`, id, data, encoding || 'utf-8'),
    onData: (id: string, cb: (data: string) => void) => {
      const handler = (_: unknown, sessionId: string, data: string) => {
        if (sessionId === id) cb(data)
      }
      ipcRenderer.on(outputChannel, handler)
      return () => ipcRenderer.removeListener(outputChannel, handler)
    },
    onClose: (id: string, cb: () => void) => {
      const handler = (_: unknown, sessionId: string) => {
        if (sessionId === id) cb()
      }
      ipcRenderer.on(closedChannel, handler)
      return () => ipcRenderer.removeListener(closedChannel, handler)
    },
  }
}

const ztermApi = {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    setBackgroundColor: (hex: string) => ipcRenderer.send('window:setBackgroundColor', hex),
    onMaximized: (cb: (v: boolean) => void) => {
      const handler = (_: unknown, v: boolean) => cb(v)
      ipcRenderer.on('window:maximized', handler)
      return () => ipcRenderer.removeListener('window:maximized', handler)  // 与 onData 相同，供组件卸载时取消订阅
    },
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    zoomWheelStep: (deltaY: number) => ipcRenderer.send('window:zoomWheelStep', deltaY),
  },

  ssh: {
    ...createStreamSessionBridge('ssh'),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.send('ssh:resize', id, cols, rows),
  },

  sftp: {
    connect: (id: string, config: Parameters<ZTermApi['sftp']['connect']>[1]) =>
      ipcRenderer.invoke('sftp:connect', id, config),
    disconnect: (id: string) => ipcRenderer.invoke('sftp:disconnect', id),
    list: (id: string, remotePath: string) => ipcRenderer.invoke('sftp:list', id, remotePath),
    download: (id: string, remotePath: string, localPath: string) =>
      ipcRenderer.invoke('sftp:download', id, remotePath, localPath),
    downloadDir: (id: string, remoteDir: string, localDir: string) =>
      ipcRenderer.invoke('sftp:downloadDir', id, remoteDir, localDir),
    upload: (id: string, localPath: string, remotePath: string) =>
      ipcRenderer.invoke('sftp:upload', id, localPath, remotePath),
    mkdir: (id: string, remotePath: string) => ipcRenderer.invoke('sftp:mkdir', id, remotePath),
    delete: (id: string, remotePath: string) => ipcRenderer.invoke('sftp:delete', id, remotePath),
    rename: (id: string, oldPath: string, newPath: string) =>
      ipcRenderer.invoke('sftp:rename', id, oldPath, newPath),
    onProgress: (id: string, cb: (progress: ZTermProgress) => void) => {
      const handler = (_: unknown, sessionId: string, progress: ZTermProgress) => {
        if (sessionId === id) cb(progress)
      }
      ipcRenderer.on('sftp:progress', handler)
      return () => ipcRenderer.removeListener('sftp:progress', handler)
    },
  },

  telnet: createStreamSessionBridge('telnet'),

  serial: {
    listPorts: () => ipcRenderer.invoke('serial:listPorts'),
    ...createStreamSessionBridge('serial'),
  },

  credentials: {
    isAvailable: () => ipcRenderer.invoke('credentials:isAvailable'),
    get: (savedId: string) => ipcRenderer.invoke('credentials:get', savedId),
    sync: (savedId: string, partial: Record<string, unknown>) =>
      ipcRenderer.invoke('credentials:sync', savedId, partial),
    remove: (savedId: string) => ipcRenderer.invoke('credentials:remove', savedId),
    duplicate: (fromId: string, toId: string) => ipcRenderer.invoke('credentials:duplicate', fromId, toId),
    clearAll: () => ipcRenderer.invoke('credentials:clearAll'),
  },

  paths: {
    getDownloadsPath: () => ipcRenderer.invoke('app:getDownloadsPath'),
    chooseDirectory: () => ipcRenderer.invoke('app:chooseDirectory'),
    validateLogDirectory: (dir: string) => ipcRenderer.invoke('app:validateLogDirectory', dir),
    validateLocalFilePath: (filePath: string, kind?: string) =>
      ipcRenderer.invoke('app:validateLocalFilePath', filePath, kind),
    getPathForFile: (file: File) => {
      if (!file || typeof file !== 'object') return ''
      try {
        return webUtils.getPathForFile(file)
      } catch {
        return ''
      }
    },
  },

  save: {
    terminalOutput: (defaultName: string, text: string) =>
      ipcRenderer.invoke('app:saveTerminalOutput', defaultName, text),
    jsonExport: (defaultName: string, jsonText: string) =>
      ipcRenderer.invoke('app:saveJsonExport', defaultName, jsonText),
  },

  log: {
    write: (logDir: string, sessionId: string, data: string) =>
      ipcRenderer.send('log:write', logDir, sessionId, data),
    append: (logDir: string, sessionId: string, data: string) =>
      ipcRenderer.send('log:append', logDir, sessionId, data),
  },

  others: {
    setUiLanguage: (uiLanguage: 'zh' | 'en') => ipcRenderer.send('app:setUiLanguage', uiLanguage),
  },
} satisfies ZTermApi

contextBridge.exposeInMainWorld('zterm', ztermApi)
