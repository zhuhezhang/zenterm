/**
 * Worker 线程里跑 ssh2。握手和 DH 交换放在 Worker 里，避免卡住 Electron 主进程事件循环
 * 一次完整的连接：
 * TerminalPanel          主进程 ssh.js              Worker ssh2
     | connect(id,cfg)      |                          |
     |--------------------->| new Worker(config)       |
     |                      |------------------------->| connect()
     |                      |<----- HOST_VERIFY -------| (若需要)
     |                      | verifySshHostKeyTrust()  |
     |                      |------ VERIFY_RESULT ----->|
     |                      |<-------- READY ----------| shell 就绪
     |<--- ipcOk() ---------| sshSessions.set(id)      |
     | onData / onResize    |                          |
     | sendData ----------->| WRITE ------------------->| stream
     |<----- ssh:output ----|<-------- OUTPUT ----------|
 */
import { Worker } from 'worker_threads'
import { fileURLToPath } from 'url'
import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { verifySshHostKeyTrust } from '../lib/sshKnownHosts.js'
import { ipcFailFromThrown, ipcFail, ipcOk } from '../lib/ipcResponse.js'
import { stringToTerminalBytes } from '../lib/encodeTerminalWrite.js'

/** 存储每个 SSH 会话对应的 Worker 桥接状态（键id → 值{ worker: Worker, isClosed: boolean }） */
const sshSessions = new Map()

/** Worker 入口文件 */
const workerEntry = fileURLToPath(new URL('../workers/sshSessionWorker.js', import.meta.url))

/**
 * 设置 SSH 相关的 IPC 处理函数，传入 ipcMain 和 mainWindow 以便在处理函数中使用 IPC 和窗口通信
 * @param {Electron.IpcMain} ipcMain Electron 的 ipcMain
 * @param {Electron.BrowserWindow} mainWindow 主窗口实例
 */
function setupSSHHandlers(ipcMain, mainWindow) {
  ipcMain.handle('ssh:connect', async (event, id, config) => {  // 连接 SSH，参数为会话ID、配置对象，返回连接结果
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)

    return new Promise((resolve) => {
      let settled = false
      let worker
      /**
       * 处理 SSH 连接失败
       * @param {string} error 错误消息
       * @param {Record<string, string|number>} [errorParams] 错误参数（如{name: '张三'}）
       * @param {boolean} [errorKnown=true] 是否已知 i18n 错误码；未传时默认为 true（前端翻译）
       */
      const finishFail = (error, errorParams, errorKnown = true) => {
        if (settled) return
        settled = true
        sshSessions.delete(id)
        try {
          worker?.terminate()
        } catch (_) {}
        resolve(
          ipcFail(String(error || 'ssh.connectionFailed'), errorKnown, errorParams, {}),
        )
      }

      /** 处理 SSH 连接成功 */
      const finishOk = () => {
        if (settled) return
        settled = true
        resolve(ipcOk())
      }

      try {
        worker = new Worker(workerEntry, {
          type: 'module',
          workerData: { config },
        })  // 起一个子线程 Worker 跑 ssh2，Worker 启动后立即执行（文件名末尾有 .js 会被视为 Worker 入口）
      } catch (e) {
        return resolve(ipcFailFromThrown(e))
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

      worker.on('message', async (msg) => {  // 注册监听来自子线程 Worker 的消息
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
      worker.on('error', (err) => finishFail(err.message, undefined, false))  // 注册监听来自子线程 Worker 的错误事件，参数为错误对象
      worker.on('exit', (code) => {  // 监听来自子线程 Worker 的退出事件，参数为退出码
        if (!settled) {
          finishFail('ssh.workerExitUnexpected', { code })
        } else if (sshSessions.has(id) && !session.isClosed) {
          closeSessionOnce()
        }
      })
    })
  })

  ipcMain.on('ssh:data', (event, id, data, encoding) => {  // 注册处理 SSH 数据事件，参数为会话ID、数据、编码，返回发送结果
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

  ipcMain.on('ssh:resize', (event, id, cols, rows) => {  // 处理 SSH 调整大小事件，参数为会话ID、列数、行数，返回调整大小结果
    if (!isTrustedIpcSender(event.sender)) return
    const session = sshSessions.get(id)
    if (session?.worker) {
      try {
        session.worker.postMessage({ type: 'RESIZE', cols, rows })
      } catch (_) {}
    }
  })

  ipcMain.handle('ssh:disconnect', async (event, id) => {  // 断开 SSH 连接，参数为会话ID，返回断开结果
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
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
    return ipcOk()
  })
}

export { setupSSHHandlers }
