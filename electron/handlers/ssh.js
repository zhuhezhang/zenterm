const { Client } = require('ssh2')

/** 存储所有 SSH 会话信息的 Map */
const sshSessions = new Map()

/**
 * 设置 SSH 相关的 IPC 处理函数，传入 ipcMain 和 mainWindow 以便在处理函数中使用 IPC 和窗口通信
 * @param {Electron.IpcMain} ipcMain Electron 的 IPC 主进程模块，用于监听和处理来自渲染进程的 IPC 消息
 * @param {Electron.BrowserWindow} mainWindow 主窗口实例，用于在处理函数中向渲染进程发送 IPC 消息 
 */
function setupSSHHandlers(ipcMain, mainWindow) {
  ipcMain.handle('ssh:connect', async (_event, id, config) => {
    return new Promise((resolve, reject) => {
      const conn = new Client()

      conn.on('ready', () => {
        conn.shell({ term: 'xterm-256color' }, (err, stream) => {
          if (err) {
            conn.end()
            return reject({ success: false, error: err.message })
          }

          sshSessions.set(id, { conn, stream })

          stream.on('data', (data) => {
            mainWindow.webContents.send('ssh:output', id, data.toString('binary'))
          })

          stream.stderr.on('data', (data) => {
            mainWindow.webContents.send('ssh:output', id, data.toString('binary'))
          })

          stream.on('close', () => {
            sshSessions.delete(id)
            mainWindow.webContents.send('ssh:closed', id)
          })

          resolve({ success: true })
        })
      })

      conn.on('error', (err) => {
        reject({ success: false, error: err.message })
      })

      const connectConfig = {
        host: config.host,
        port: config.port || 22,
        username: config.username,
        readyTimeout: 20000,
        keepaliveInterval: 10000,
      }

      if (config.authType === 'password') {
        connectConfig.password = config.password
      } else if (config.authType === 'privateKey') {
        connectConfig.privateKey = config.privateKey
        if (config.passphrase) connectConfig.passphrase = config.passphrase
      }

      try {
        conn.connect(connectConfig)
      } catch (e) {
        reject({ success: false, error: e.message })
      }
    })
  })

  ipcMain.on('ssh:data', (_event, id, data) => {
    const session = sshSessions.get(id)
    if (session && session.stream) {
      session.stream.write(data)
    }
  })

  ipcMain.on('ssh:resize', (_event, id, cols, rows) => {
    const session = sshSessions.get(id)
    if (session && session.stream) {
      session.stream.setWindow(rows, cols)
    }
  })

  ipcMain.handle('ssh:disconnect', async (_event, id) => {
    const session = sshSessions.get(id)
    if (session) {
      try {
        session.stream.end()
        session.conn.end()
      } catch (e) {}
      sshSessions.delete(id)
    }
    return { success: true }
  })
}

module.exports = { setupSSHHandlers }
