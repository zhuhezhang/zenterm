/**
 * sftp 后端处理流程参考 ssh 的解释，两者相似的
 */
import { Worker } from 'worker_threads'
import { fileURLToPath } from 'url'
import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { ipcFail, ipcFailFromThrown, ipcOk } from '../lib/ipcResponse.js'
import { collectResolvedRoots } from '../lib/localPathPolicy.js'
import { assertSftpLocalDirAllowedForRoots, assertSftpLocalFilePathAllowedForRoots } from '../lib/sftpLocalPathRoots.js'
import { verifySshHostKeyTrust } from '../lib/sshKnownHosts.js'

/** 存储每个 SFTP 会话对应的 Worker 与会话状态 */
const sftpSessions = new Map()

/**
 * 处理命令失败
 * @param {object} msg Worker CMD_RESULT 消息体
 */
function sftpCmdFailure(msg) {
  const code = msg.error || 'sftp.unknownError'
  return ipcFail(code, true, msg.errorParams)
}

/** Worker 入口文件 */
const workerEntry = fileURLToPath(new URL('../workers/sftpSessionWorker.js', import.meta.url))

/**
 * 发送命令到子进程 Worker
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
      resolve(ipcFailFromThrown(e))
    }
  })
}

/**
 * 拒绝所有等待的请求
 * @param {object} session 会话状态
 * @param {string} error 错误码或库原始 message
 * @param {Record<string, string|number>} [errorParams]
 */
function rejectAllPending(session, error, errorParams) {
  const payload = ipcFail(String(error), true, errorParams)
  for (const res of session.pending.values()) {
    res(payload)
  }
  session.pending.clear()
}

/**
 * 设置 SFTP 相关的 IPC 处理函数
 * @param {Electron.IpcMain} ipcMain ipcMain 实例
 * @param {Electron.BrowserWindow} mainWindow 主窗口实例
 */
function setupSFTPHandlers(ipcMain, mainWindow) {
  ipcMain.handle('sftp:connect', async (event, id, config) => {  // 连接 SFTP，参数为会话ID、配置对象，返回连接结果
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)

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
      const finishFail = (error, errorParams) => {
        if (settled) return
        settled = true
        sftpSessions.delete(id)
        const code = String(error || 'sftp.connectionFailed')
        rejectAllPending(session, code, errorParams)
        try {
          worker?.terminate()
        } catch (_) {}
        resolve(ipcFail(code, true, errorParams))
      }

      /** 处理连接成功 */
      const finishOk = () => {
        if (settled) return
        settled = true
        resolve(ipcOk())
      }

      /** 关闭会话一次 */
      const closeSessionOnce = () => {
        if (session.isClosed) return
        session.isClosed = true
        sftpSessions.delete(id)
        rejectAllPending(session, 'sftp.sessionClosed')
        try {
          session.worker?.terminate()
        } catch (_) {}
      }

      /**
       * 处理来自子进程 Worker 消息
       * @param msg {object} Worker 消息
       */
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
          finishFail(msg.error, msg.errorParams)
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
            config,
            allowedRoots: collectResolvedRoots(),
          },
        })
        session.worker = worker
      } catch (e) {
        return resolve(ipcFailFromThrown(e))
      }

      worker.on('message', onWorkerMessage)  // 监听 Worker 消息事件
      worker.on('error', (err) => finishFail(err.message))  // 监听 Worker 错误事件
      worker.on('exit', (code) => {  // 监听 Worker 退出事件
        if (!settled) {
          finishFail('sftp.workerExitUnexpected', { code })
        } else if (sftpSessions.has(id) && !session.isClosed) {
          closeSessionOnce()  // 关闭会话一次
        }
      })
    })
  })

  ipcMain.handle('sftp:disconnect', async (event, id) => {  // 断开 SFTP 连接，参数为会话ID，返回断开结果
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sftpSessions.get(id)
    if (session?.worker) {
      rejectAllPending(session, 'sftp.disconnected')
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
    return ipcOk()
  })

  ipcMain.handle('sftp:list', async (event, id, remotePath) => {  // 列出远程目录，参数为会话ID、远程路径，返回列出结果
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    const msg = await workerCommand(session, { cmd: 'LIST', remotePath })
    if (!msg.success) return sftpCmdFailure(msg)
    return ipcOk({ items: msg.items })
  })

  ipcMain.handle('sftp:download', async (event, id, remotePath, localPath) => {  // 下载文件，参数为会话ID、远程路径、本地路径，返回下载结果
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    try {
      assertSftpLocalFilePathAllowedForRoots(localPath, collectResolvedRoots(), 'download')
    } catch (e) {
      return ipcFailFromThrown(e)
    }
    const msg = await workerCommand(session, { cmd: 'DOWNLOAD', remotePath, localPath })
    if (!msg.success) return sftpCmdFailure(msg)
    return ipcOk()
  })

  ipcMain.handle('sftp:downloadDir', async (event, id, remoteDir, localDir) => {  // 下载目录，参数为会话ID、远程目录、本地目录，返回下载结果
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    try {
      assertSftpLocalDirAllowedForRoots(localDir, collectResolvedRoots(), 'download')
    } catch (e) {
      return ipcFailFromThrown(e)
    }
    const msg = await workerCommand(session, { cmd: 'DOWNLOAD_DIR', remoteDir, localDir })
    if (!msg.success) return sftpCmdFailure(msg)
    return ipcOk()
  })

  ipcMain.handle('sftp:upload', async (event, id, localPath, remotePath) => {  // 上传文件，参数为会话ID、本地路径、远程路径，返回上传结果
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    try {
      assertSftpLocalFilePathAllowedForRoots(localPath, collectResolvedRoots(), 'upload')
    } catch (e) {
      return ipcFailFromThrown(e)
    }
    const msg = await workerCommand(session, { cmd: 'UPLOAD', localPath, remotePath })
    if (!msg.success) return sftpCmdFailure(msg)
    return ipcOk()
  })

  ipcMain.handle('sftp:mkdir', async (event, id, remotePath) => {  // 创建目录，参数为会话ID、远程路径，返回创建结果
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    const msg = await workerCommand(session, { cmd: 'MKDIR', remotePath })
    if (!msg.success) return sftpCmdFailure(msg)
    return ipcOk()
  })

  ipcMain.handle('sftp:delete', async (event, id, remotePath) => {  // 删除文件，参数为会话ID、远程路径，返回删除结果
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    const msg = await workerCommand(session, { cmd: 'DELETE', remotePath })
    if (!msg.success) return sftpCmdFailure(msg)
    return ipcOk()
  })

  ipcMain.handle('sftp:rename', async (event, id, oldPath, newPath) => {  // 重命名文件，参数为会话ID、旧路径、新路径，返回重命名结果
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    const msg = await workerCommand(session, { cmd: 'RENAME', oldPath, newPath })
    if (!msg.success) return sftpCmdFailure(msg)
    return ipcOk()
  })
}

export { setupSFTPHandlers }
