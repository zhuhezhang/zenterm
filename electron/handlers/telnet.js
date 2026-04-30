const net = require('net')

/** 存储所有 Telnet 会话信息的 Map，键为会话 ID，值为 net.Socket 实例 */
const telnetSessions = new Map()

// Telnet 协议常量，用于选项协商（IAC: Interpret As Command）
const TELNET_IAC = 255
const TELNET_DO = 253
const TELNET_DONT = 254
const TELNET_WILL = 251
const TELNET_WONT = 252
const TELNET_SB = 250
const TELNET_SE = 240

/**
 * 处理 Telnet 数据，过滤掉协议命令并返回纯数据内容
 * @param {Buffer} data 从 Telnet 连接接收到的数据
 * @returns {Buffer} 处理后的数据，去除了 Telnet 协议命令
 */
function processTelnetData(data) {
  const output = []
  let i = 0
  while (i < data.length) {
    if (data[i] === TELNET_IAC) {
      i++
      if (i >= data.length) break
      const cmd = data[i]
      if (cmd === TELNET_DO || cmd === TELNET_DONT || cmd === TELNET_WILL || cmd === TELNET_WONT) {
        i += 2  // 跳过命令和选项字节
      } else if (cmd === TELNET_SB) {
        i++  // 跳过 SB 命令字节
        while (i < data.length && data[i] !== TELNET_SE) i++
        i++  // 跳过 SE 命令字节
      } else {
        i++  // 跳过其他 IAC 命令字节
      }
    } else {
      output.push(data[i])
      i++
    }
  }
  return Buffer.from(output)
}

/**
 * 设置 Telnet 相关的 IPC 处理函数，传入 ipcMain 和 mainWindow 以便在处理函数中使用 IPC 和窗口通信
 * @param {Electron.IpcMain} ipcMain Electron 的 IPC 主进程模块，用于监听和处理来自渲染进程的 IPC 消息
 * @param {Electron.BrowserWindow} mainWindow 主窗口实例，用于在处理函数中向渲染进程发送 IPC 消息 
 */
function setupTelnetHandlers(ipcMain, mainWindow) {
  ipcMain.handle('telnet:connect', async (_event, id, config) => {  // 监听渲染进程 telnet 连接请求，传入会话 ID 和连接配置
    return new Promise((resolve, _reject) => {
      const socket = new net.Socket()
      let connected = false
      let settled = false
      const resolveOnce = (payload) => {  // 确保只解析一次 Promise，避免重复解析
        if (settled) return
        settled = true
        resolve(payload)
      }
      const timeout = setTimeout(() => {  // 连接超时（10s）处理，销毁 socket 并返回错误信息
        socket.destroy()
        resolveOnce({ success: false, error: 'Connection timeout' })
      }, 10000)

      socket.connect(config.port || 23, config.host, () => {  // 连接到主机和端口（默认 23），成功后存储会话并解析 Promise
        clearTimeout(timeout)  // 连接成功，清除超时定时器
        connected = true
        telnetSessions.set(id, socket)
        resolveOnce({ success: true })
      })

      socket.on('data', (data) => {  // 监听从服务器接收的数据，处理 Telnet 协议命令并发送纯数据到渲染进程
        const processed = processTelnetData(data)
        if (processed.length > 0) {
          mainWindow.webContents.send('telnet:output', id, processed.toString('binary'))
        }
      })

      socket.on('close', () => {  // 监听服务器关闭连接，清理会话并通知渲染进程
        telnetSessions.delete(id)
        mainWindow.webContents.send('telnet:closed', id)
      })

      socket.on('error', (err) => {  // 监听服务器错误信息，清理并根据连接状态拒绝或通知
        clearTimeout(timeout)
        telnetSessions.delete(id)
        if (!connected) {
          resolveOnce({ success: false, error: err.message })
        } else {
          mainWindow.webContents.send('telnet:closed', id)
        }
      })
    })
  })

  ipcMain.on('telnet:data', (_event, id, data) => {  // 监听来自渲染进程的数据，将数据写入套接字（发送至服务器）
    const socket = telnetSessions.get(id)
    if (socket) {
      socket.write(data)
    }
  })

  ipcMain.handle('telnet:disconnect', async (_event, id) => {  // 监听来自渲染进程的断开连接请求，销毁套接字并清理会话
    const socket = telnetSessions.get(id)
    if (socket) {
      try { socket.destroy() } catch (e) {}
      telnetSessions.delete(id)
    }
    return { success: true }
  })
}

module.exports = { setupTelnetHandlers }
