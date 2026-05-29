/**
 * sftp 后端处理流程参考 ssh 的解释，两者相似的
 */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { Worker } from 'worker_threads'
import { fileURLToPath } from 'url'
import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { handleHostVerifyMessage } from '../lib/hostVerifyMessage.js'
import { sendToRenderer } from '../lib/mainWindowSend.js'
import { ipcFail, ipcFailFromThrown, ipcOk } from '../lib/ipcResponse.js'
import { ipcFromWorkerCmdResult } from '../lib/workerCmdResult.js'
import { collectResolvedRoots } from '../lib/localPathPolicy.js'
import { assertSftpLocalDirAllowedForRoots, assertSftpLocalFilePathAllowedForRoots } from '../lib/sftpLocalPathRoots.js'
import type { MainWindowGetter, SftpSessionState } from '../types/handlers.js'

/** 存储每个 SFTP 会话对应的 Worker 与会话状态 */
const sftpSessions = new Map<string, SftpSessionState>()

/** Worker 入口文件 */
const workerEntry = fileURLToPath(new URL('../workers/sftpSessionWorker.js', import.meta.url))

/**
 * 发送命令到子进程 Worker
 */
function workerCommand(session: SftpSessionState, payload: Record<string, unknown>) {
  return new Promise<Record<string, unknown>>((resolve) => {
    const reqId = ++session.reqSeq
    session.pending.set(reqId, resolve)
    try {
      if (!session.worker) {
        session.pending.delete(reqId)
        resolve(ipcFail('sftp.noSession', true) as unknown as Record<string, unknown>)
        return
      }
      session.worker.postMessage({ type: 'CMD', reqId, ...payload })
    } catch (e) {
      session.pending.delete(reqId)
      resolve(ipcFailFromThrown(e) as unknown as Record<string, unknown>)
    }
  })
}

/**
 * 拒绝所有等待的请求
 */
function rejectAllPending(session: SftpSessionState, error: string, errorParams?: Record<string, string | number>) {
  const payload = ipcFail(String(error), true, errorParams)
  for (const res of session.pending.values()) {
    res(payload as unknown as Record<string, unknown>)
  }
  session.pending.clear()
}

/**
 * 设置 SFTP 相关的 IPC 处理函数
 */
function setupSFTPHandlers(ipcMain: IpcMain, getMainWindow: MainWindowGetter) {
  ipcMain.handle('sftp:connect', async (event: IpcMainInvokeEvent, id: unknown, config: unknown) => {
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

      const onWorkerMessage = async (msg: Record<string, unknown>) => {
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
          finishFail(String(msg.error ?? 'sftp.connectionFailed'), msg.errorParams as Record<string, string | number> | undefined)
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

  ipcMain.handle('sftp:disconnect', async (event: IpcMainInvokeEvent, id: unknown) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (typeof id !== 'string') return ipcOk()
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

  ipcMain.handle('sftp:list', async (event: IpcMainInvokeEvent, id: unknown, remotePath: unknown) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (typeof id !== 'string') return ipcFail('app.invalidRequest', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    const msg = await workerCommand(session, { cmd: 'LIST', remotePath })
    return ipcFromWorkerCmdResult(msg)
  })

  ipcMain.handle('sftp:download', async (event: IpcMainInvokeEvent, id: unknown, remotePath: unknown, localPath: unknown) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (typeof id !== 'string') return ipcFail('app.invalidRequest', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    try {
      assertSftpLocalFilePathAllowedForRoots(String(localPath), collectResolvedRoots(), 'download')
    } catch (e) {
      return ipcFailFromThrown(e)
    }
    const msg = await workerCommand(session, { cmd: 'DOWNLOAD', remotePath, localPath })
    return ipcFromWorkerCmdResult(msg)
  })

  ipcMain.handle('sftp:downloadDir', async (event: IpcMainInvokeEvent, id: unknown, remoteDir: unknown, localDir: unknown) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (typeof id !== 'string') return ipcFail('app.invalidRequest', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    try {
      assertSftpLocalDirAllowedForRoots(String(localDir), collectResolvedRoots(), 'download')
    } catch (e) {
      return ipcFailFromThrown(e)
    }
    const msg = await workerCommand(session, { cmd: 'DOWNLOAD_DIR', remoteDir, localDir })
    return ipcFromWorkerCmdResult(msg)
  })

  ipcMain.handle('sftp:upload', async (event: IpcMainInvokeEvent, id: unknown, localPath: unknown, remotePath: unknown) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (typeof id !== 'string') return ipcFail('app.invalidRequest', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    try {
      assertSftpLocalFilePathAllowedForRoots(String(localPath), collectResolvedRoots(), 'upload')
    } catch (e) {
      return ipcFailFromThrown(e)
    }
    const msg = await workerCommand(session, { cmd: 'UPLOAD', localPath, remotePath })
    return ipcFromWorkerCmdResult(msg)
  })

  ipcMain.handle('sftp:mkdir', async (event: IpcMainInvokeEvent, id: unknown, remotePath: unknown) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (typeof id !== 'string') return ipcFail('app.invalidRequest', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    const msg = await workerCommand(session, { cmd: 'MKDIR', remotePath })
    return ipcFromWorkerCmdResult(msg)
  })

  ipcMain.handle('sftp:delete', async (event: IpcMainInvokeEvent, id: unknown, remotePath: unknown) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (typeof id !== 'string') return ipcFail('app.invalidRequest', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    const msg = await workerCommand(session, { cmd: 'DELETE', remotePath })
    return ipcFromWorkerCmdResult(msg)
  })

  ipcMain.handle('sftp:rename', async (event: IpcMainInvokeEvent, id: unknown, oldPath: unknown, newPath: unknown) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (typeof id !== 'string') return ipcFail('app.invalidRequest', true)
    const session = sftpSessions.get(id)
    if (!session) return ipcFail('sftp.noSession', true)
    const msg = await workerCommand(session, { cmd: 'RENAME', oldPath, newPath })
    return ipcFromWorkerCmdResult(msg)
  })
}

export { setupSFTPHandlers }
