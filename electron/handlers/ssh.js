import { Worker } from 'worker_threads'
import { fileURLToPath } from 'url'
import { isTrustedIpcSender, IPC_UNAUTHORIZED } from '../lib/trustedSender.js'
import { verifySshHostKeyTrust } from '../lib/sshKnownHosts.js'
import { stringToTerminalBytes } from '../lib/encodeTerminalWrite.js'

/** 存储每个 SSH 会话对应的 Worker 桥接状态 */
const sshSessions = new Map()

/** Worker 入口文件 */
const workerEntry = fileURLToPath(new URL('../workers/sshSessionWorker.js', import.meta.url))

/**
 * 设置 SSH 相关的 IPC 处理函数，传入 ipcMain 和 mainWindow 以便在处理函数中使用 IPC 和窗口通信
 * @param {Electron.IpcMain} ipcMain Electron 的 ipcMain
 * @param {Electron.BrowserWindow} mainWindow 主窗口实例
 */
function setupSSHHandlers(ipcMain, mainWindow) {
  /**
   * 处理 SSH 连接请求
   * @param {Electron.IpcMainEvent} event 事件
   * @param {string} id 会话 ID
   * @param {object} config 配置
   * @returns {Promise<object>} 结果
   */
  ipcMain.handle('ssh:connect', async (event, id, config) => {
    if (!isTrustedIpcSender(event.sender)) return IPC_UNAUTHORIZED

    return new Promise((resolve) => {
      let settled = false
      let worker
      /**
       * 处理 SSH 连接失败
       * @param {string} error 错误消息
       */
      const finishFail = (error) => {
        if (settled) return
        settled = true
        sshSessions.delete(id)
        try {
          worker?.terminate()
        } catch (_) {}
        resolve({ success: false, error: String(error || 'SSH connection failed') })
      }

      /** 处理 SSH 连接成功 */
      const finishOk = () => {
        if (settled) return
        settled = true
        resolve({ success: true })
      }

      try {
        worker = new Worker(workerEntry, {
          type: 'module',
          workerData: { config },
        })
      } catch (e) {
        return resolve({ success: false, error: e.message })
      }

      const session = { worker, isClosed: false }

      /** 关闭会话一次 */
      const closeSessionOnce = () => {
        if (session.isClosed) return
        session.isClosed = true
        sshSessions.delete(id)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ssh:closed', id)
        }
        try {
          worker.terminate()
        } catch (_) {}
      }

      worker.on('message', async (msg) => {  // 监听 Worker 消息事件
        if (msg.type === 'HOST_VERIFY') {  // 处理主机公钥校验请求
          const raw = Buffer.from(msg.keyBase64, 'base64')
          const ok = await verifySshHostKeyTrust(mainWindow, msg.host, msg.port, raw)
          try {
            worker.postMessage({ type: 'HOST_VERIFY_RESULT', reqId: msg.reqId, ok })
          } catch (_) {}
          return
        }
        if (msg.type === 'OUTPUT') {  // 处理输出消息
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('ssh:output', id, msg.data)
          }
          return
        }
        if (msg.type === 'READY') {  // 处理连接成功消息
          sshSessions.set(id, session)
          finishOk()
          return
        }
        if (msg.type === 'CONNECT_FAILED') {  // 处理连接失败消息
          finishFail(msg.error)
          return
        }
        if (msg.type === 'CLOSED') {  // 处理关闭消息
          closeSessionOnce()
        }
      })

      worker.on('error', (err) => finishFail(err.message))  // 监听 Worker 错误事件

      worker.on('exit', (code) => {  // 监听 Worker 退出事件
        if (!settled) {
          finishFail(`SSH worker exited unexpectedly (${code})`)
        } else if (sshSessions.has(id) && !session.isClosed) {
          closeSessionOnce()
        }
      })
    })
  })

  ipcMain.on('ssh:data', (event, id, data, encoding) => {  // 处理 SSH 数据事件
    if (!isTrustedIpcSender(event.sender)) return
    const session = sshSessions.get(id)
    if (session?.worker) {
      try {
        const buf =
          typeof data === 'string'
            ? stringToTerminalBytes(data, encoding)
            : Buffer.isBuffer(data)
              ? data
              : Buffer.from(data)
        session.worker.postMessage({ type: 'WRITE', data: buf })
      } catch (_) {}
    }
  })

  ipcMain.on('ssh:resize', (event, id, cols, rows) => {  // 处理 SSH 调整大小事件
    if (!isTrustedIpcSender(event.sender)) return
    const session = sshSessions.get(id)
    if (session?.worker) {
      try {
        session.worker.postMessage({ type: 'RESIZE', cols, rows })
      } catch (_) {}
    }
  })

  ipcMain.handle('ssh:disconnect', async (event, id) => {  // 处理 SSH 断开连接请求
    if (!isTrustedIpcSender(event.sender)) return IPC_UNAUTHORIZED
    const session = sshSessions.get(id)
    if (session?.worker) {
      try {
        session.worker.postMessage({ type: 'DISCONNECT' })
      } catch (_) {}
      setTimeout(() => {
        try {
          session.worker.terminate()
        } catch (_) {}
      }, 120)
    }
    return { success: true }
  })
}

export { setupSSHHandlers }
