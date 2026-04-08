const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('zterm', {  // 在渲染进程中通过window.zterm访问暴露的API
  getDownloadsPath: () => ipcRenderer.sendSync('app:getDownloadsPath'),  // 同步调用主进程获取下载目录路径
  chooseDirectory: () => ipcRenderer.invoke('app:chooseDirectory'),  // 弹出目录选择框，返回选中的目录路径（异步）

  log: {  // 日志写入
    write: (logDir, sessionId, data) => ipcRenderer.send('log:write', logDir, sessionId, data),
  },

  window: {  // 窗口控制
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximized: (cb) => ipcRenderer.on('window:maximized', (_, v) => cb(v)),
  },

  ssh: {  // SSH
    connect: (id, config) => ipcRenderer.invoke('ssh:connect', id, config),
    disconnect: (id) => ipcRenderer.invoke('ssh:disconnect', id),
    sendData: (id, data) => ipcRenderer.send('ssh:data', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('ssh:resize', id, cols, rows),
    onData: (id, cb) => {
      const handler = (_, sessionId, data) => { if (sessionId === id) cb(data) }
      ipcRenderer.on('ssh:output', handler)
      return () => ipcRenderer.removeListener('ssh:output', handler)
    },
    onClose: (id, cb) => {
      const handler = (_, sessionId) => { if (sessionId === id) cb() }
      ipcRenderer.on('ssh:closed', handler)
      return () => ipcRenderer.removeListener('ssh:closed', handler)
    },
  },

  sftp: {  // SFTP
    connect: (id, config) => ipcRenderer.invoke('sftp:connect', id, config),
    disconnect: (id) => ipcRenderer.invoke('sftp:disconnect', id),
    list: (id, remotePath) => ipcRenderer.invoke('sftp:list', id, remotePath),
    download: (id, remotePath, localPath) => ipcRenderer.invoke('sftp:download', id, remotePath, localPath),
    upload: (id, localPath, remotePath) => ipcRenderer.invoke('sftp:upload', id, localPath, remotePath),
    mkdir: (id, remotePath) => ipcRenderer.invoke('sftp:mkdir', id, remotePath),
    delete: (id, remotePath) => ipcRenderer.invoke('sftp:delete', id, remotePath),
    rename: (id, oldPath, newPath) => ipcRenderer.invoke('sftp:rename', id, oldPath, newPath),
    onProgress: (id, cb) => {
      const handler = (_, sessionId, progress) => { if (sessionId === id) cb(progress) }
      ipcRenderer.on('sftp:progress', handler)
      return () => ipcRenderer.removeListener('sftp:progress', handler)
    },
  },

  telnet: {  // Telnet
    connect: (id, config) => ipcRenderer.invoke('telnet:connect', id, config),
    disconnect: (id) => ipcRenderer.invoke('telnet:disconnect', id),
    sendData: (id, data) => ipcRenderer.send('telnet:data', id, data),
    onData: (id, cb) => {
      const handler = (_, sessionId, data) => { if (sessionId === id) cb(data) }
      ipcRenderer.on('telnet:output', handler)
      return () => ipcRenderer.removeListener('telnet:output', handler)
    },
    onClose: (id, cb) => {
      const handler = (_, sessionId) => { if (sessionId === id) cb() }
      ipcRenderer.on('telnet:closed', handler)
      return () => ipcRenderer.removeListener('telnet:closed', handler)
    },
  },

  // Serial
  serial: {
    listPorts: () => ipcRenderer.invoke('serial:listPorts'),
    connect: (id, config) => ipcRenderer.invoke('serial:connect', id, config),
    disconnect: (id) => ipcRenderer.invoke('serial:disconnect', id),
    sendData: (id, data) => ipcRenderer.send('serial:data', id, data),
    onData: (id, cb) => {
      const handler = (_, sessionId, data) => { if (sessionId === id) cb(data) }
      ipcRenderer.on('serial:output', handler)
      return () => ipcRenderer.removeListener('serial:output', handler)
    },
    onClose: (id, cb) => {
      const handler = (_, sessionId) => { if (sessionId === id) cb() }
      ipcRenderer.on('serial:closed', handler)
      return () => ipcRenderer.removeListener('serial:closed', handler)
    },
  },
})
