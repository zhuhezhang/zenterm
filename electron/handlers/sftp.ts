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
import type {
  SftpWorkerCmdPayload,
  SftpWorkerCmdResultMessage,
  SftpWorkerOutboundMessage,
} from '../types/workerMessages.js'

/** 存储每个 SFTP 会话对应的 Worker 与会话状态 */
const sftpSessions = new Map<string, SftpSessionState>()

/** Worker 入口文件 */
const workerEntry = fileURLToPath(new URL('../workers/sftpSessionWorker.js', import.meta.url))

/**
 * 发送命令到子进程 Worker
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
 */
function setupSFTPHandlers(ipcMain: IpcMain, getMainWindow: MainWindowGetter) {
  ipcMain.handle('sftp:connect', async (event: IpcMainInvokeEvent, id: string, config: SshConnectConfig) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (typeof id !== 'string') return ipcFail('app.invalidRequest', true)

    return new Promise((resolve) => {
      let settled = false
      let worker: Worker | undefined

      const session: SftpSessionState = {
        worker: null,
        pending: new Map(),
        reqSeq: 0,
        isClosed: false,
      }

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

      const finishOk = () => {
        if (settled) return
        settled = true
        resolve(ipcOk())
      }

      const closeSessionOnce = () => {
        if (session.isClosed) return
        session.isClosed = true
        sftpSessions.delete(id)
        rejectAllPending(session, 'sftp.sessionClosed')
        try {
          session.worker?.terminate()
        } catch {}
      }

      const onWorkerMessage = async (msg: SftpWorkerOutboundMessage) => {
        if (msg.type === 'HOST_VERIFY') {
          if (worker) await handleHostVerifyMessage(getMainWindow, worker, msg)
          return
        }
        if (msg.type === 'PROGRESS') {
          sendToRenderer(getMainWindow, 'sftp:progress', id, msg.progress)
          return
        }
        if (msg.type === 'CMD_RESULT') {
          const reqId = Number(msg.reqId)
          const res = session.pending.get(reqId)
          session.pending.delete(reqId)
          res?.(msg)
          return
        }
        if (msg.type === 'READY') {
          sftpSessions.set(id, session)
          finishOk()
          return
        }
        if (msg.type === 'CONNECT_FAILED') {
          finishFail(String(msg.error ?? 'sftp.connectionFailed'), msg.errorParams)
          return
        }
        if (msg.type === 'CLOSED') {
          closeSessionOnce()
        }
      }

      try {
        worker = new Worker(workerEntry, {
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

      worker.on('message', onWorkerMessage)
      worker.on('error', (err: Error) => finishFail(err.message))
      worker.on('exit', (code) => {
        if (!settled) {
          finishFail('sftp.workerExitUnexpected', { code })
        } else if (sftpSessions.has(id) && !session.isClosed) {
          closeSessionOnce()
        }
      })
    })
  })

  ipcMain.handle('sftp:disconnect', async (event: IpcMainInvokeEvent, id: string) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sftpSessions.get(id)
    if (session?.worker) {
      rejectAllPending(session, 'sftp.disconnected')
      sftpSessions.delete(id)
      try {
        session.worker.postMessage({ type: 'DISCONNECT' })
      } catch {}
      const workerRef = session.worker
      setTimeout(() => {
        try {
          workerRef.terminate()
        } catch {}
      }, 120)
    }
    return ipcOk()
  })

  ipcMain.handle('sftp:list', async (event: IpcMainInvokeEvent, id: string, remotePath: string) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    const msg = await workerCommand(session, { cmd: 'LIST', remotePath })
    return ipcFromWorkerCmdResult(msg)
  })

  ipcMain.handle('sftp:download', async (event: IpcMainInvokeEvent, id: string, remotePath: string, localPath: string) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    try {
      assertSftpLocalFilePathAllowedForRoots(localPath, collectResolvedRoots(), 'download')
    } catch (e) {
      return ipcFailFromThrown(e)
    }
    const msg = await workerCommand(session, { cmd: 'DOWNLOAD', remotePath, localPath })
    return ipcFromWorkerCmdResult(msg)
  })

  ipcMain.handle('sftp:downloadDir', async (event: IpcMainInvokeEvent, id: string, remoteDir: string, localDir: string) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    try {
      assertSftpLocalDirAllowedForRoots(localDir, collectResolvedRoots(), 'download')
    } catch (e) {
      return ipcFailFromThrown(e)
    }
    const msg = await workerCommand(session, { cmd: 'DOWNLOAD_DIR', remoteDir, localDir })
    return ipcFromWorkerCmdResult(msg)
  })

  ipcMain.handle('sftp:upload', async (event: IpcMainInvokeEvent, id: string, localPath: string, remotePath: string) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    try {
      assertSftpLocalFilePathAllowedForRoots(localPath, collectResolvedRoots(), 'upload')
    } catch (e) {
      return ipcFailFromThrown(e)
    }
    const msg = await workerCommand(session, { cmd: 'UPLOAD', localPath, remotePath })
    return ipcFromWorkerCmdResult(msg)
  })

  ipcMain.handle('sftp:mkdir', async (event: IpcMainInvokeEvent, id: string, remotePath: string) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    const msg = await workerCommand(session, { cmd: 'MKDIR', remotePath })
    return ipcFromWorkerCmdResult(msg)
  })

  ipcMain.handle('sftp:delete', async (event: IpcMainInvokeEvent, id: string, remotePath: string) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    const msg = await workerCommand(session, { cmd: 'DELETE', remotePath })
    return ipcFromWorkerCmdResult(msg)
  })

  ipcMain.handle('sftp:rename', async (event: IpcMainInvokeEvent, id: string, oldPath: string, newPath: string) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    const msg = await workerCommand(session, { cmd: 'RENAME', oldPath, newPath })
    return ipcFromWorkerCmdResult(msg)
  })
}

export { setupSFTPHandlers }
