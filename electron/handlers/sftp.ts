/** sftp 后端处理流程参考 ssh 的解释，两者相似的 */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { Worker } from 'worker_threads'
import { fileURLToPath } from 'url'
import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { handleHostVerifyMessage } from '../lib/hostVerifyMessage.js'
import { sendToRenderer } from '../lib/mainWindowSend.js'
import { ipcFail, ipcFailFromThrown, ipcOk } from '../lib/ipcResponse.js'
import { ipcFailAsWorkerCmdResult, ipcFromWorkerCmdResult } from '../lib/workerCmdResult.js'
import { collectResolvedRoots } from '../lib/localPathPolicy.js'
import { assertSftpLocalDirAllowedForRoots, assertSftpLocalFilePathAllowedForRoots } from '../lib/sftpLocalPathRoots.js'
import type { MainWindowGetter, SftpSessionState } from '../types/handlers.js'
import type { SshConnectConfig } from '../../shared/zterm-api.js'
import type { SftpWorkerCmdPayload, SftpWorkerCmdResultMessage, SftpWorkerOutboundMessage } from '../types/workerMessages.js'

/** 存储每个 SFTP 会话对应的 Worker 和会话状态 */
const sftpSessions = new Map<string, SftpSessionState>()

/** Worker 入口文件 */
const workerEntry = fileURLToPath(new URL('../workers/sftpSessionWorker.js', import.meta.url))

/**
 * 发送命令到子线程 Worker
 * @param session SFTP 会话状态
 * @param payload 命令负载
 * @returns 命令结果
 */
function workerCommand(session: SftpSessionState, payload: SftpWorkerCmdPayload) {
  return new Promise<SftpWorkerCmdResultMessage>((resolve) => {
    const reqId = ++session.reqSeq
    session.pending.set(reqId, resolve)
    try {
      if (!session.worker) {
        session.pending.delete(reqId)
        resolve(ipcFailAsWorkerCmdResult(reqId, 'sftp.noSession'))
        return
      }
      session.worker.postMessage({ type: 'CMD', reqId, ...payload })
    } catch (e) {
      session.pending.delete(reqId)
      const fail = ipcFailFromThrown(e)
      resolve(ipcFailAsWorkerCmdResult(reqId, fail.content.error, fail.errorKnown, fail.content.errorParams))
    }
  })
}

/**
 * 拒绝所有等待的请求
 * @param session SFTP 会话状态
 * @param error 错误信息
 * @param errorParams 错误参数
 */
function rejectAllPending(session: SftpSessionState, error: string, errorParams?: Record<string, string | number>) {
  const payload = ipcFailAsWorkerCmdResult(0, String(error), true, errorParams)
  for (const res of session.pending.values()) {
    res(payload)
  }
  session.pending.clear()
}

/**
 * 设置 SFTP 相关的 IPC 处理函数
 * @param ipcMain IPC 主进程
 * @param getMainWindow 获取主窗口
 */
function setupSFTPHandlers(ipcMain: IpcMain, getMainWindow: MainWindowGetter) {
  ipcMain.handle('sftp:connect', async (event: IpcMainInvokeEvent, id: string, config: SshConnectConfig) => {  // 处理来自渲染进程的连接请求
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (typeof id !== 'string') return ipcFail('app.invalidRequest', true)

    return new Promise((resolve) => {  // 创建一个 Promise 对象，用于处理连接请求
      let settled = false
      let worker: Worker | undefined

      /** 创建一个 SftpSessionState 对象，用于存储会话状态 */
      const session: SftpSessionState = {
        worker: null,
        pending: new Map(),
        reqSeq: 0,
        isClosed: false,
      }

      /** 处理连接失败 */
      const finishFail = (error: string, errorParams?: Record<string, string | number>) => {
        if (settled) return
        settled = true
        sftpSessions.delete(id)
        const code = String(error || 'sftp.connectionFailed')
        rejectAllPending(session, code, errorParams)
        try {
          worker?.terminate()
        } catch {}
        resolve(ipcFail(code, true, errorParams))
      }

      /** 处理连接成功 */
      const finishOk = () => {
        if (settled) return
        settled = true
        resolve(ipcOk())
      }

      /** 关闭会话 */
      const closeSessionOnce = () => {
        if (session.isClosed) return
        session.isClosed = true
        sftpSessions.delete(id)
        rejectAllPending(session, 'sftp.sessionClosed')
        try {
          session.worker?.terminate()
        } catch {}
      }

      /** 处理来自子线程的消息 */
      const onWorkerMessage = async (msg: SftpWorkerOutboundMessage) => {
        if (msg.type === 'HOST_VERIFY') {  // 处理来自子线程的 HOST_VERIFY 消息
          if (worker) await handleHostVerifyMessage(getMainWindow, worker, msg)
          return
        }
        if (msg.type === 'PROGRESS') {  // 处理来自子线程的 PROGRESS 消息
          sendToRenderer(getMainWindow, 'sftp:progress', id, msg.progress)
          return
        }
        if (msg.type === 'CMD_RESULT') {  // 处理来自子线程的 CMD_RESULT 消息
          const reqId = Number(msg.reqId)
          const res = session.pending.get(reqId)
          session.pending.delete(reqId)
          res?.(msg)
          return
        }
        if (msg.type === 'READY') {  // 处理来自子线程的 READY 消息
          sftpSessions.set(id, session)
          finishOk()
          return
        }
        if (msg.type === 'CONNECT_FAILED') {  // 处理来自子线程的 CONNECT_FAILED 消息
          finishFail(String(msg.error ?? 'sftp.connectionFailed'), msg.errorParams)
          return
        }
        if (msg.type === 'CLOSED') {  // 处理来自子线程的 CLOSED 消息
          closeSessionOnce()
        }
      }

      try {
        worker = new Worker(workerEntry, {  // 创建子线程 Worker
          type: 'module',
          workerData: {
            config,
            allowedRoots: collectResolvedRoots(),
          },
        } as import('node:worker_threads').WorkerOptions)
        session.worker = worker
      } catch (e) {
        resolve(ipcFailFromThrown(e))
        return
      }

      worker.on('message', onWorkerMessage)  // 监听来自子线程的消息
      worker.on('error', (err: Error) => finishFail(err.message))  // 处理来自子线程的错误消息
      worker.on('exit', (code) => {  // 处理来自子线程的退出消息
        if (!settled) {
          finishFail('sftp.workerExitUnexpected', { code })
        } else if (sftpSessions.has(id) && !session.isClosed) {  // 处理会话关闭
          closeSessionOnce()
        }
      })
    })
  })

  ipcMain.handle('sftp:disconnect', async (event: IpcMainInvokeEvent, id: string) => {  // 处理来自渲染进程的断开连接请求
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sftpSessions.get(id)
    if (session?.worker) {
      rejectAllPending(session, 'sftp.disconnected')  // 拒绝所有等待的请求
      sftpSessions.delete(id)
      try {
        session.worker.postMessage({ type: 'DISCONNECT' })  // 发送断开连接消息到子线程
      } catch {}
      const workerRef = session.worker
      setTimeout(() => {  // 延迟终止子线程
        try {
          workerRef.terminate()
        } catch {}
      }, 120)
    }
    return ipcOk()
  })

  ipcMain.handle('sftp:list', async (event: IpcMainInvokeEvent, id: string, remotePath: string) => {  // 处理来自渲染进程的列出请求
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    const msg = await workerCommand(session, { cmd: 'LIST', remotePath })  // 发送列出请求到子线程
    return ipcFromWorkerCmdResult(msg)
  })

  ipcMain.handle('sftp:download', async (event: IpcMainInvokeEvent, id: string, remotePath: string, localPath: string) => {  // 处理来自渲染进程的下载请求
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    try {
      assertSftpLocalFilePathAllowedForRoots(localPath, collectResolvedRoots(), 'download')
    } catch (e) {
      return ipcFailFromThrown(e)
    }
    const msg = await workerCommand(session, { cmd: 'DOWNLOAD', remotePath, localPath })  // 发送下载请求到子线程
    return ipcFromWorkerCmdResult(msg)
  })

  ipcMain.handle('sftp:downloadDir', async (event: IpcMainInvokeEvent, id: string, remoteDir: string, localDir: string) => {  // 处理来自渲染进程的下载目录请求
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    try {
      assertSftpLocalDirAllowedForRoots(localDir, collectResolvedRoots(), 'download')
    } catch (e) {
      return ipcFailFromThrown(e)
    }
    const msg = await workerCommand(session, { cmd: 'DOWNLOAD_DIR', remoteDir, localDir })  // 发送下载目录请求到子线程
    return ipcFromWorkerCmdResult(msg)
  })

  ipcMain.handle('sftp:upload', async (event: IpcMainInvokeEvent, id: string, localPath: string, remotePath: string) => {  // 处理来自渲染进程的上传请求
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    try {
      assertSftpLocalFilePathAllowedForRoots(localPath, collectResolvedRoots(), 'upload')
    } catch (e) {
      return ipcFailFromThrown(e)
    }
    const msg = await workerCommand(session, { cmd: 'UPLOAD', localPath, remotePath })  // 发送上传请求到子线程
    return ipcFromWorkerCmdResult(msg)
  })

  ipcMain.handle('sftp:mkdir', async (event: IpcMainInvokeEvent, id: string, remotePath: string) => {  // 处理来自渲染进程的创建目录请求
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    const msg = await workerCommand(session, { cmd: 'MKDIR', remotePath })  // 发送创建目录请求到子线程
    return ipcFromWorkerCmdResult(msg)
  })

  ipcMain.handle('sftp:delete', async (event: IpcMainInvokeEvent, id: string, remotePath: string) => {  // 处理来自渲染进程的删除请求
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    const msg = await workerCommand(session, { cmd: 'DELETE', remotePath })
    return ipcFromWorkerCmdResult(msg)
  })

  ipcMain.handle('sftp:rename', async (event: IpcMainInvokeEvent, id: string, oldPath: string, newPath: string) => {  // 处理来自渲染进程的重命名请求
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    const msg = await workerCommand(session, { cmd: 'RENAME', oldPath, newPath })  // 发送重命名请求到子线程
    return ipcFromWorkerCmdResult(msg)
  })
}

export { setupSFTPHandlers }
