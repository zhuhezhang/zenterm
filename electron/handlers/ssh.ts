import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { Worker } from 'worker_threads'
import { fileURLToPath } from 'url'
import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { handleHostVerifyMessage } from '../lib/hostVerifyMessage.js'
import { sendToRenderer } from '../lib/mainWindowSend.js'
import { ipcFailFromThrown, ipcFail, ipcOk } from '../lib/ipcResponse.js'
import { encodeOutgoingTerminalData } from '../lib/terminalEncodingService.js'
import type { MainWindowGetter, SshSessionState } from '../types/handlers.js'
import type { SshConnectConfig } from '../../shared/connectConfig.js'

/** 存储每个 SSH 会话对应的 Worker 桥接状态（键id → 值{ worker: Worker, isClosed: boolean }） */
const sshSessions = new Map<string, SshSessionState>()

/** Worker 入口文件 */
const workerEntry = fileURLToPath(new URL('../workers/sshSessionWorker.js', import.meta.url))

/**
 * 设置 SSH 相关的 IPC 处理函数
 */
function setupSSHHandlers(ipcMain: IpcMain, getMainWindow: MainWindowGetter) {
  ipcMain.handle('ssh:connect', async (event: IpcMainInvokeEvent, id: unknown, config: unknown) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (typeof id !== 'string') return ipcFail('app.invalidRequest', true)

    return new Promise((resolve) => {
      let settled = false
      let worker: Worker

      const finishFail = (
        error: string,
        errorParams?: Record<string, string | number>,
        errorKnown = true,
      ) => {
        if (settled) return
        settled = true
        sshSessions.delete(id)
        try {
          worker?.terminate()
        } catch {}
        resolve(
          ipcFail(String(error || 'ssh.connectionFailed'), errorKnown, errorParams, {}),
        )
      }

      const finishOk = () => {
        if (settled) return
        settled = true
        resolve(ipcOk())
      }

      try {
        worker = new Worker(workerEntry, {
          type: 'module',
          workerData: { config },
        } as import('node:worker_threads').WorkerOptions)
      } catch (e) {
        resolve(ipcFailFromThrown(e))
        return
      }

      const session: SshSessionState = { worker, isClosed: false }

      const closeSessionOnce = () => {
        if (session.isClosed) return
        session.isClosed = true
        sshSessions.delete(id)
        sendToRenderer(getMainWindow, 'ssh:closed', id)
        try {
          worker.terminate()
        } catch {}
      }

      worker.on('message', async (msg: Record<string, unknown>) => {
        if (msg.type === 'HOST_VERIFY') {
          await handleHostVerifyMessage(getMainWindow, worker, msg)
          return
        }
        if (msg.type === 'OUTPUT') {
          sendToRenderer(getMainWindow, 'ssh:output', id, msg.data)
          return
        }
        if (msg.type === 'READY') {
          sshSessions.set(id, session)
          finishOk()
          return
        }
        if (msg.type === 'CONNECT_FAILED') {
          finishFail(String(msg.error ?? 'ssh.connectionFailed'))
          return
        }
        if (msg.type === 'CLOSED') {
          closeSessionOnce()
        }
      })
      worker.on('error', (err: Error) => finishFail(err.message, undefined, false))
      worker.on('exit', (code) => {
        if (!settled) {
          finishFail('ssh.workerExitUnexpected', { code })
        } else if (sshSessions.has(id) && !session.isClosed) {
          closeSessionOnce()
        }
      })
    })
  })

  ipcMain.on('ssh:data', (event: IpcMainEvent, id: unknown, data: unknown, encoding: unknown) => {
    if (!isTrustedIpcSender(event.sender)) return
    if (typeof id !== 'string') return
    const session = sshSessions.get(id)
    if (session?.worker) {
      try {
        session.worker.postMessage({
          type: 'WRITE',
          data: encodeOutgoingTerminalData(data, typeof encoding === 'string' ? encoding : undefined),
        })
      } catch {}
    }
  })

  ipcMain.on('ssh:resize', (event: IpcMainEvent, id: unknown, cols: unknown, rows: unknown) => {
    if (!isTrustedIpcSender(event.sender)) return
    if (typeof id !== 'string') return
    const session = sshSessions.get(id)
    if (session?.worker) {
      try {
        session.worker.postMessage({ type: 'RESIZE', cols, rows })
      } catch {}
    }
  })

  ipcMain.handle('ssh:disconnect', async (event: IpcMainInvokeEvent, id: unknown) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (typeof id !== 'string') return ipcOk()
    const session = sshSessions.get(id)
    if (session?.worker) {
      sshSessions.delete(id)
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
}

export { setupSSHHandlers }
export type { SshConnectConfig }
