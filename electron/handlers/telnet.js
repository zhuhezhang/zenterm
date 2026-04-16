const net = require('net')

const telnetSessions = new Map()

// Basic Telnet option negotiation
const TELNET_IAC = 255
const TELNET_DO = 253
const TELNET_DONT = 254
const TELNET_WILL = 251
const TELNET_WONT = 252
const TELNET_SB = 250
const TELNET_SE = 240

function processTelnetData(data) {
  const output = []
  let i = 0
  while (i < data.length) {
    if (data[i] === TELNET_IAC) {
      i++
      if (i >= data.length) break
      const cmd = data[i]
      if (cmd === TELNET_DO || cmd === TELNET_DONT || cmd === TELNET_WILL || cmd === TELNET_WONT) {
        i += 2 // skip option byte
      } else if (cmd === TELNET_SB) {
        // skip subnegotiation
        i++
        while (i < data.length && data[i] !== TELNET_SE) i++
        i++
      } else {
        i++
      }
    } else {
      output.push(data[i])
      i++
    }
  }
  return Buffer.from(output)
}

function setupTelnetHandlers(ipcMain, mainWindow) {
  ipcMain.handle('telnet:connect', async (_event, id, config) => {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket()
      const timeout = setTimeout(() => {
        socket.destroy()
        reject({ success: false, error: 'Connection timeout' })
      }, 10000)

      socket.connect(config.port || 23, config.host, () => {
        clearTimeout(timeout)
        telnetSessions.set(id, socket)
        resolve({ success: true })
      })

      socket.on('data', (data) => {
        const processed = processTelnetData(data)
        if (processed.length > 0) {
          mainWindow.webContents.send('telnet:output', id, processed.toString('binary'))
        }
      })

      socket.on('close', () => {
        telnetSessions.delete(id)
        mainWindow.webContents.send('telnet:closed', id)
      })

      socket.on('error', (err) => {
        clearTimeout(timeout)
        telnetSessions.delete(id)
        if (!resolve.called) {
          reject({ success: false, error: err.message })
        } else {
          mainWindow.webContents.send('telnet:closed', id)
        }
      })
    })
  })

  ipcMain.on('telnet:data', (_event, id, data) => {
    const socket = telnetSessions.get(id)
    if (socket) {
      socket.write(data)
    }
  })

  ipcMain.handle('telnet:disconnect', async (_event, id) => {
    const socket = telnetSessions.get(id)
    if (socket) {
      try { socket.destroy() } catch (e) {}
      telnetSessions.delete(id)
    }
    return { success: true }
  })
}

module.exports = { setupTelnetHandlers }
