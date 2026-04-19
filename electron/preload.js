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
    // 主进程 → 渲染进程：ipcRenderer 收到 'window:maximized' 事件
    // 事件处理器：(_, v) => cb(v) 被调用
    // 用户回调：传入的 cb 函数被执行，接收 v（true/false）
    onMaximized: (cb) => ipcRenderer.on('window:maximized', (_, v) => cb(v)),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },

  ssh: {  // SSH 连接 API
    connect: (id, config) => ipcRenderer.invoke('ssh:connect', id, config),  // 连接 SSH，传入会话 ID 和配置对象，返回连接结果（异步）
    disconnect: (id) => ipcRenderer.invoke('ssh:disconnect', id),  // 断开 SSH 连接，传入会话 ID，返回断开结果（异步）
    sendData: (id, data) => ipcRenderer.send('ssh:data', id, data),  // 渲染进程发送数据到主进程 SSH 会话，传入会话 ID 和数据
    resize: (id, cols, rows) => ipcRenderer.send('ssh:resize', id, cols, rows),  // 调整 SSH 会话窗口大小，传入会话 ID、列数和行数
    onData: (id, cb) => {  // 监听 SSH 会话数据输出，传入会话 ID 和回调函数
      const handler = (_, sessionId, data) => { if (sessionId === id) cb(data) }
      ipcRenderer.on('ssh:output', handler)
      return () => ipcRenderer.removeListener('ssh:output', handler)  // 给渲染进程返回一个清理函数用于让渲染进程取消监听，避免内存泄漏或反复监听
    },
    onClose: (id, cb) => {  // 监听 SSH 会话关闭，传入会话 ID 和回调函数
      const handler = (_, sessionId) => { if (sessionId === id) cb() }
      ipcRenderer.on('ssh:closed', handler)
      return () => ipcRenderer.removeListener('ssh:closed', handler)
    },
  },

  sftp: {  // SFTP 连接 API
    connect: (id, config) => ipcRenderer.invoke('sftp:connect', id, config),
    disconnect: (id) => ipcRenderer.invoke('sftp:disconnect', id),
    list: (id, remotePath) => ipcRenderer.invoke('sftp:list', id, remotePath),
    download: (id, remotePath, localPath) => ipcRenderer.invoke('sftp:download', id, remotePath, localPath),
    upload: (id, localPath, remotePath) => ipcRenderer.invoke('sftp:upload', id, localPath, remotePath),
    mkdir: (id, remotePath) => ipcRenderer.invoke('sftp:mkdir', id, remotePath),
    delete: (id, remotePath) => ipcRenderer.invoke('sftp:delete', id, remotePath),
    rename: (id, oldPath, newPath) => ipcRenderer.invoke('sftp:rename', id, oldPath, newPath),
    onProgress: (id, cb) => {  // 监听 SFTP 传输进度，传入会话 ID 和回调函数
      const handler = (_, sessionId, progress) => { if (sessionId === id) cb(progress) }
      ipcRenderer.on('sftp:progress', handler)
      return () => ipcRenderer.removeListener('sftp:progress', handler)
    },
  },

  telnet: {  // Telnet 连接 API
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

  serial: {  // Serial 串口通信 API
    listPorts: () => ipcRenderer.invoke('serial:listPorts'),  // 获取可用串口列表（异步）
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
