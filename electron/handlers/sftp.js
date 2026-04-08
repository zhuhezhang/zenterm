const { Client } = require('ssh2')
const fs = require('fs')
const path = require('path')

const sftpSessions = new Map()

function setupSFTPHandlers(ipcMain, mainWindow) {
  ipcMain.handle('sftp:connect', async (event, id, config) => {
    return new Promise((resolve, reject) => {
      const conn = new Client()

      conn.on('ready', () => {
        conn.sftp((err, sftp) => {
          if (err) {
            conn.end()
            return reject({ success: false, error: err.message })
          }
          sftpSessions.set(id, { conn, sftp })
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
      }

      if (config.authType === 'password') {
        connectConfig.password = config.password
      } else if (config.authType === 'privateKey') {
        connectConfig.privateKey = config.privateKey
        if (config.passphrase) connectConfig.passphrase = config.passphrase
      }

      conn.connect(connectConfig)
    })
  })

  ipcMain.handle('sftp:disconnect', async (event, id) => {
    const session = sftpSessions.get(id)
    if (session) {
      try { session.conn.end() } catch (e) {}
      sftpSessions.delete(id)
    }
    return { success: true }
  })

  ipcMain.handle('sftp:list', async (event, id, remotePath) => {
    const session = sftpSessions.get(id)
    if (!session) return { success: false, error: 'No SFTP session' }

    return new Promise((resolve) => {
      session.sftp.readdir(remotePath, (err, list) => {
        if (err) return resolve({ success: false, error: err.message })
        const items = list.map(item => ({
          name: item.filename,
          path: remotePath === '/' ? '/' + item.filename : remotePath + '/' + item.filename,
          isDir: item.attrs.isDirectory(),
          size: item.attrs.size,
          mtime: item.attrs.mtime * 1000,
          permissions: item.attrs.mode,
        })).sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        resolve({ success: true, items })
      })
    })
  })

  ipcMain.handle('sftp:download', async (event, id, remotePath, localPath) => {
    const session = sftpSessions.get(id)
    if (!session) return { success: false, error: 'No SFTP session' }

    return new Promise((resolve) => {
      const total = { size: 0, transferred: 0 }
      session.sftp.stat(remotePath, (err, stat) => {
        if (!err) total.size = stat.size
      })

      session.sftp.fastGet(remotePath, localPath, {
        step: (transferred, chunk, total_size) => {
          mainWindow.webContents.send('sftp:progress', id, {
            type: 'download',
            file: remotePath,
            transferred,
            total: total_size,
            percent: Math.round((transferred / total_size) * 100),
          })
        },
      }, (err) => {
        if (err) return resolve({ success: false, error: err.message })
        resolve({ success: true })
      })
    })
  })

  ipcMain.handle('sftp:upload', async (event, id, localPath, remotePath) => {
    const session = sftpSessions.get(id)
    if (!session) return { success: false, error: 'No SFTP session' }

    return new Promise((resolve) => {
      const stat = fs.statSync(localPath)
      session.sftp.fastPut(localPath, remotePath, {
        step: (transferred, chunk, total_size) => {
          mainWindow.webContents.send('sftp:progress', id, {
            type: 'upload',
            file: localPath,
            transferred,
            total: total_size,
            percent: Math.round((transferred / total_size) * 100),
          })
        },
      }, (err) => {
        if (err) return resolve({ success: false, error: err.message })
        resolve({ success: true })
      })
    })
  })

  ipcMain.handle('sftp:mkdir', async (event, id, remotePath) => {
    const session = sftpSessions.get(id)
    if (!session) return { success: false, error: 'No SFTP session' }
    return new Promise((resolve) => {
      session.sftp.mkdir(remotePath, (err) => {
        if (err) return resolve({ success: false, error: err.message })
        resolve({ success: true })
      })
    })
  })

  ipcMain.handle('sftp:delete', async (event, id, remotePath) => {
    const session = sftpSessions.get(id)
    if (!session) return { success: false, error: 'No SFTP session' }
    return new Promise((resolve) => {
      session.sftp.unlink(remotePath, (err) => {
        if (err) {
          session.sftp.rmdir(remotePath, (err2) => {
            if (err2) return resolve({ success: false, error: err2.message })
            resolve({ success: true })
          })
          return
        }
        resolve({ success: true })
      })
    })
  })

  ipcMain.handle('sftp:rename', async (event, id, oldPath, newPath) => {
    const session = sftpSessions.get(id)
    if (!session) return { success: false, error: 'No SFTP session' }
    return new Promise((resolve) => {
      session.sftp.rename(oldPath, newPath, (err) => {
        if (err) return resolve({ success: false, error: err.message })
        resolve({ success: true })
      })
    })
  })
}

module.exports = { setupSFTPHandlers }
