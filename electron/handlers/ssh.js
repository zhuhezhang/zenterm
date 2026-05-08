import { Client } from 'ssh2'
import { DEFAULT_ALGORITHM_PREFERENCES } from '../../shared/sshAlgorithmDefaults.js'
import { isTrustedIpcSender, IPC_UNAUTHORIZED } from '../lib/trustedSender.js'

/** 存储所有 SSH 会话信息的 Map */
const sshSessions = new Map()

/**
 * 设置 SSH 相关的 IPC 处理函数，传入 ipcMain 和 mainWindow 以便在处理函数中使用 IPC 和窗口通信
 * @param {Electron.IpcMain} ipcMain Electron 的 IPC 主进程模块，用于监听和处理来自渲染进程的 IPC 消息
 * @param {Electron.BrowserWindow} mainWindow 主窗口实例，用于在处理函数中向渲染进程发送 IPC 消息 
 */
function setupSSHHandlers(ipcMain, mainWindow) {
  ipcMain.handle('ssh:connect', async (event, id, config) => {
    if (!isTrustedIpcSender(event.sender)) return IPC_UNAUTHORIZED
    return new Promise((resolve, _reject) => {
      const conn = new Client()
      
      conn.on('ready', () => {  // 监听 ready 事件（SSH 认证成功后触发）
        conn.shell({ term: 'xterm-256color' }, (err, stream) => {  // 调用 conn.shell() 启动交互式 shell，指定终端类型为 xterm-256color
          if (err) {  // 如果启动 shell 失败，关闭连接并返回错误信息
            conn.end()
            return resolve({ success: false, error: err.message })
          }

          // 保存连接信息；监听数据输出和连接关闭事件，并通过 mainWindow.webContents.send 向渲染进程发送对应的 IPC 消息
          const session = { conn, stream, isClosed: false }
          const closeSessionOnce = () => {
            if (session.isClosed) return
            session.isClosed = true
            sshSessions.delete(id)
            mainWindow.webContents.send('ssh:closed', id)
          }

          sshSessions.set(id, session)
          stream.on('data', (data) => {
            mainWindow.webContents.send('ssh:output', id, data.toString('binary'))
          })
          stream.stderr.on('data', (data) => {
            mainWindow.webContents.send('ssh:output', id, data.toString('binary'))
          })
          stream.on('close', closeSessionOnce)
          conn.on('close', closeSessionOnce)

          resolve({ success: true })  // 连接成功后，解析 Promise
        })
      })
      conn.on('error', (err) => {
        resolve({ success: false, error: err.message })  // 连接错误时，返回失败结果给渲染进程
      })

      /** 构建连接配置对象，根据用户选择的认证方式（密码或私钥）设置相应的属性，并调用 conn.connect() 发起 SSH 连接请求 */
      const connectConfig = {
        host: config.host,
        port: config.port || 22,
        username: config.username,
        readyTimeout: 20000,  // 连接超时20秒
        keepaliveInterval: 10000,  // 发送 keepalive 消息的间隔时间（10秒）
      }

      if (config.algorithms && typeof config.algorithms === 'object') {
        const filtered = {}
        for (const key in DEFAULT_ALGORITHM_PREFERENCES) {  // 遍历默认算法偏好设置，只保留用户配置中存在的算法类别
          if (Array.isArray(config.algorithms[key]) && config.algorithms[key].length) {
            filtered[key] = config.algorithms[key]
          }
        }
        if (Object.keys(filtered).length) {
          connectConfig.algorithms = filtered
        }
      }
      if (!connectConfig.algorithms) {
        connectConfig.algorithms = DEFAULT_ALGORITHM_PREFERENCES
      }

      if (config.authType === 'password') {
        connectConfig.password = config.password
      } else if (config.authType === 'privateKey') {
        connectConfig.privateKey = config.privateKey
        if (config.passphrase) connectConfig.passphrase = config.passphrase
      }

      try {
        conn.connect(connectConfig)  // 发起 SSH 连接请求，连接结果将通过 ready 和 error 事件处理器处理
      } catch (e) {
        resolve({ success: false, error: e.message })
      }
    })
  })

  ipcMain.on('ssh:data', (event, id, data) => {
    if (!isTrustedIpcSender(event.sender)) return
    const session = sshSessions.get(id)
    if (session && session.stream) {
      session.stream.write(data)
    }
  })

  ipcMain.on('ssh:resize', (event, id, cols, rows) => {
    if (!isTrustedIpcSender(event.sender)) return
    const session = sshSessions.get(id)
    if (session && session.stream) {
      session.stream.setWindow(rows, cols)
    }
  })

  ipcMain.handle('ssh:disconnect', async (event, id) => {
    if (!isTrustedIpcSender(event.sender)) return IPC_UNAUTHORIZED
    const session = sshSessions.get(id)
    if (session) {
      try {
        if (typeof session.stream.close === 'function') {  // 先关闭 channel，再稍后结束底层连接，避免关闭竞态(主进程抛了 Invalid Zlib instance 错误)
          session.stream.close()
        } else {
          session.stream.end()
        }
        setTimeout(() => {
          try { session.conn.end() } catch (e) {}
        }, 50)
      } catch (e) {}
    }
    return { success: true }
  })
}

export { setupSSHHandlers }
