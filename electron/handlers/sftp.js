import { Worker } from 'worker_threads'
import { fileURLToPath } from 'url'
import { isTrustedIpcSender, IPC_UNAUTHORIZED } from '../lib/trustedSender.js'
import {
  assertSftpLocalDirAllowed,
  assertSftpLocalFilePathAllowed,
  getAllowedUserRootPaths,
} from '../lib/localPathPolicy.js'
import { verifySshHostKeyTrust } from '../lib/sshKnownHosts.js'

/** 存储每个 SFTP 会话对应的 Worker 与会话状态 */
const sftpSessions = new Map()

/** Worker 入口文件 */
const workerEntry = fileURLToPath(new URL('../workers/sftpSessionWorker.js', import.meta.url))

/**
 * 发送命令到 Worker
 * @param {{ worker: Worker, pending: Map<number, (msg: object) => void>, reqSeq: number, isClosed: boolean }} session 会话状态
 * @param {object} payload 命令及参数
 * @returns {Promise<object>} CMD_RESULT 消息体
 */
function workerCommand(session, payload) {
  return new Promise((resolve) => {
    const reqId = ++session.reqSeq
    session.pending.set(reqId, resolve)
    try {
      session.worker.postMessage({ type: 'CMD', reqId, ...payload })
    } catch (e) {
      session.pending.delete(reqId)
      resolve({ success: false, error: e.message })
    }
  })
}

/**
 * 拒绝所有等待的请求
 * @param {object} session 会话状态
 * @param {string} error 错误消息
 */
function rejectAllPending(session, error) {
  for (const res of session.pending.values()) {
    res({ success: false, error })
  }
  session.pending.clear()
}

/**
 * 设置 SFTP 相关的 IPC 处理函数
 * @param {Electron.IpcMain} ipcMain
 * @param {Electron.BrowserWindow} mainWindow
 */
function setupSFTPHandlers(ipcMain, mainWindow) {
  ipcMain.handle('sftp:connect', async (event, id, config) => {
    if (!isTrustedIpcSender(event.sender)) return IPC_UNAUTHORIZED

    return new Promise((resolve) => {
      let settled = false
      let worker

      /** 会话状态 */
      const session = {
        worker: /** @type {Worker|null} */ (null),
        pending: new Map(),
        reqSeq: 0,
        isClosed: false,
      }

      /** 处理连接失败 */
      const finishFail = (error) => {
        if (settled) return
        settled = true
        sftpSessions.delete(id)
        rejectAllPending(session, String(error || 'SFTP connection failed'))
        try {
          worker?.terminate()
        } catch (_) {}
        resolve({ success: false, error: String(error || 'SFTP connection failed') })
      }

      /** 处理连接成功 */
      const finishOk = () => {
        if (settled) return
        settled = true
        resolve({ success: true })
      }

      /** 关闭会话一次 */
      const closeSessionOnce = () => {
        if (session.isClosed) return
        session.isClosed = true
        sftpSessions.delete(id)
        rejectAllPending(session, 'SFTP session closed')
        try {
          session.worker?.terminate()
        } catch (_) {}
      }

      /** 处理 Worker 消息 */
      const onWorkerMessage = async (msg) => {
        if (msg.type === 'HOST_VERIFY') {  // 处理主机公钥校验请求
          const raw = Buffer.from(msg.keyBase64, 'base64')
          const ok = await verifySshHostKeyTrust(mainWindow, msg.host, msg.port, raw)
          try {
            worker.postMessage({ type: 'HOST_VERIFY_RESULT', reqId: msg.reqId, ok })
          } catch (_) {}
          return
        }
        if (msg.type === 'PROGRESS') {  // 处理进度消息
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('sftp:progress', id, msg.progress)
          }
          return
        }
        if (msg.type === 'CMD_RESULT') {  // 处理命令结果消息
          const res = session.pending.get(msg.reqId)
          session.pending.delete(msg.reqId)
          res?.(msg)
          return
        }
        if (msg.type === 'READY') {  // 处理连接成功消息
          sftpSessions.set(id, session)
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
      }

      try {
        worker = new Worker(workerEntry, {  // 创建 Worker
          type: 'module',
          workerData: {
            sessionId: id,
            config,
            allowedRoots: getAllowedUserRootPaths(),
          },
        })
        session.worker = worker
      } catch (e) {
        return resolve({ success: false, error: e.message })
      }

      worker.on('message', onWorkerMessage)  // 监听 Worker 消息事件

      worker.on('error', (err) => finishFail(err.message))  // 监听 Worker 错误事件

      worker.on('exit', (code) => {  // 监听 Worker 退出事件
        if (!settled) {
          finishFail(`SFTP worker exited unexpectedly (${code})`)
        } else if (sftpSessions.has(id) && !session.isClosed) {
          closeSessionOnce()  // 关闭会话一次
        }
      })
    })
  })

  ipcMain.handle('sftp:disconnect', async (event, id) => {  // 处理断开连接请求
    if (!isTrustedIpcSender(event.sender)) return IPC_UNAUTHORIZED
    const session = sftpSessions.get(id)
    if (session?.worker) {
      rejectAllPending(session, 'disconnected')
      sftpSessions.delete(id)
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

  ipcMain.handle('sftp:list', async (event, id, remotePath) => {  // 处理列出远程目录请求
    if (!isTrustedIpcSender(event.sender)) return { success: false, error: IPC_UNAUTHORIZED.error }
    const session = sftpSessions.get(id)
    if (!session) return { success: false, error: 'No SFTP session' }
    const msg = await workerCommand(session, { cmd: 'LIST', remotePath })
    if (!msg.success) return { success: false, error: msg.error || 'Unknown error' }
    return { success: true, items: msg.items }
  })

  ipcMain.handle('sftp:download', async (event, id, remotePath, localPath) => {  // 处理下载文件请求
    if (!isTrustedIpcSender(event.sender)) return IPC_UNAUTHORIZED
    const session = sftpSessions.get(id)
    if (!session) return { success: false, error: 'No SFTP session' }
    try {
      assertSftpLocalFilePathAllowed(localPath, '下载')
    } catch (e) {
      return { success: false, error: e.message }
    }
    const msg = await workerCommand(session, { cmd: 'DOWNLOAD', remotePath, localPath })
    if (!msg.success) return { success: false, error: msg.error || 'Unknown error' }
    return { success: true }
  })

  ipcMain.handle('sftp:downloadDir', async (event, id, remoteDir, localDir) => {  // 处理下载目录请求
    if (!isTrustedIpcSender(event.sender)) return IPC_UNAUTHORIZED
    const session = sftpSessions.get(id)
    if (!session) return { success: false, error: 'No SFTP session' }
    try {
      assertSftpLocalDirAllowed(localDir, '下载')
    } catch (e) {
      return { success: false, error: e.message }
    }
    const msg = await workerCommand(session, { cmd: 'DOWNLOAD_DIR', remoteDir, localDir })
    if (!msg.success) return { success: false, error: msg.error || 'Unknown error' }
    return { success: true }
  })

  ipcMain.handle('sftp:upload', async (event, id, localPath, remotePath) => {  // 处理上传文件请求
    if (!isTrustedIpcSender(event.sender)) return IPC_UNAUTHORIZED
    const session = sftpSessions.get(id)
    if (!session) return { success: false, error: 'No SFTP session' }
    try {
      assertSftpLocalFilePathAllowed(localPath, '上传')
    } catch (e) {
      return { success: false, error: e.message }
    }
    const msg = await workerCommand(session, { cmd: 'UPLOAD', localPath, remotePath })
    if (!msg.success) return { success: false, error: msg.error || 'Unknown error' }
    return { success: true }
  })

  ipcMain.handle('sftp:mkdir', async (event, id, remotePath) => {  // 处理创建目录请求
    if (!isTrustedIpcSender(event.sender)) return IPC_UNAUTHORIZED
    const session = sftpSessions.get(id)
    if (!session) return { success: false, error: 'No SFTP session' }
    const msg = await workerCommand(session, { cmd: 'MKDIR', remotePath })
    if (!msg.success) return { success: false, error: msg.error || 'Unknown error' }
    return { success: true }
  })

  ipcMain.handle('sftp:delete', async (event, id, remotePath) => {  // 处理删除文件请求
    if (!isTrustedIpcSender(event.sender)) return IPC_UNAUTHORIZED
    const session = sftpSessions.get(id)
    if (!session) return { success: false, error: 'No SFTP session' }
    const msg = await workerCommand(session, { cmd: 'DELETE', remotePath })
    if (!msg.success) return { success: false, error: msg.error || 'Unknown error' }
    return { success: true }
  })

  ipcMain.handle('sftp:rename', async (event, id, oldPath, newPath) => {  // 处理重命名文件请求
    if (!isTrustedIpcSender(event.sender)) return IPC_UNAUTHORIZED
    const session = sftpSessions.get(id)
    if (!session) return { success: false, error: 'No SFTP session' }
    const msg = await workerCommand(session, { cmd: 'RENAME', oldPath, newPath })
    if (!msg.success) return { success: false, error: msg.error || 'Unknown error' }
    return { success: true }
  })
}

export { setupSFTPHandlers }
