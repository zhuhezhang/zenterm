const { Client } = require('ssh2')

const sshSessions = new Map()

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
