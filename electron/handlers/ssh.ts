import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { Worker } from 'worker_threads'
import { fileURLToPath } from 'url'
import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { handleHostVerifyMessage } from '../lib/hostVerifyMessage.js'
import { sendToRenderer } from '../lib/mainWindowSend.js'
import { ipcFailFromThrown, ipcFail, ipcOk } from '../lib/ipcResponse.js'
import { encodeOutgoingTerminalData } from '../lib/terminalEncodingService.js'
import { prepareSshConnectConfig } from '../lib/prepareSshConnectConfig.js'
import type { MainWindowGetter, SshSessionState } from '../types/handlers.js'
import type { SshConnectConfig } from '../../shared/zterm-api.js'
import type { SshWorkerOutboundMessage } from '../types/workerMessages.js'

/** 存储每个 SSH 会话对应的 Worker 桥接状态（键id → 值{ worker: Worker, isClosed: boolean }） */
const sshSessions = new Map<string, SshSessionState>()

/** Worker 入口文件 */
const workerEntry = fileURLToPath(new URL('../workers/sshSessionWorker.js', import.meta.url))

/**
 * 设置 SSH 相关的 IPC 处理函数
 * @param ipcMain IPC 主进程
 * @param getMainWindow 获取主窗口
 */
function setupSSHHandlers(ipcMain: IpcMain, getMainWindow: MainWindowGetter) {
  ipcMain.handle('ssh:connect', async (event: IpcMainInvokeEvent, id: string, config: SshConnectConfig) => {  // 处理来自渲染进程的连接请求
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)

    return new Promise((resolve) => {  // 创建一个 Promise 对象，用于处理连接请求
      let settled = false
      let worker: Worker

      /** 处理连接失败 */
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

      /** 处理连接成功 */
      const finishOk = () => {
        if (settled) return
        settled = true
        resolve(ipcOk())
      }

      let workerConfig: SshConnectConfig
      try {
        workerConfig = prepareSshConnectConfig(config)
      } catch (e) {
        resolve(ipcFailFromThrown(e))
        return
      }

      try {
        worker = new Worker(workerEntry, {
          type: 'module',
          workerData: { config: workerConfig },
        } as import('node:worker_threads').WorkerOptions)
      } catch (e) {
        resolve(ipcFailFromThrown(e))
        return
      }

      /** 创建一个 SshSessionState 对象，用于存储会话状态 */
      const session: SshSessionState = { worker, isClosed: false }

      /** 关闭会话 */
      const closeSessionOnce = () => {
        if (session.isClosed) return
        session.isClosed = true
        sshSessions.delete(id)
        sendToRenderer(getMainWindow, 'ssh:closed', id)
        try {
          worker.terminate()
        } catch {}
      }

      worker.on('message', async (msg: SshWorkerOutboundMessage) => {  // 处理来自子线程的消息
        if (msg.type === 'HOST_VERIFY') {  // 处理来自子线程的 HOST_VERIFY 消息
          await handleHostVerifyMessage(getMainWindow, worker, msg)
          return
        }
        if (msg.type === 'OUTPUT') {  // 处理来自子线程的 OUTPUT 消息
          sendToRenderer(getMainWindow, 'ssh:output', id, msg.data)
          return
        }
        if (msg.type === 'READY') {  // 处理来自子线程的 READY 消息
          sshSessions.set(id, session)
          finishOk()
          return
        }
        if (msg.type === 'CONNECT_FAILED') {  // 处理来自子线程的 CONNECT_FAILED 消息
          finishFail(String(msg.error ?? 'ssh.connectionFailed'))
          return
        }
        if (msg.type === 'CLOSED') {  // 处理来自子线程的 CLOSED 消息
          closeSessionOnce()
        }
      })
      worker.on('error', (err: Error) => finishFail(err.message, undefined, false))  // 处理来自子线程的错误消息
      worker.on('exit', (code) => {  // 处理来自子线程的退出消息
        if (!settled) {
          finishFail('ssh.workerExitUnexpected', { code })
        } else if (sshSessions.has(id) && !session.isClosed) {
          closeSessionOnce()
        }
      })
    })
  })

  ipcMain.on('ssh:data', (event: IpcMainEvent, id: string, data: string, encoding?: string) => {  // 处理来自渲染进程的数据请求
    if (!isTrustedIpcSender(event.sender)) return
    const session = sshSessions.get(id)
    if (session?.worker) {
      try {
        session.worker.postMessage({
          type: 'WRITE',
          data: encodeOutgoingTerminalData(data, encoding),
        })
      } catch {}
    }
  })

  ipcMain.on('ssh:resize', (event: IpcMainEvent, id: string, cols: number, rows: number) => {  // 处理来自渲染进程的调整窗口大小请求
    if (!isTrustedIpcSender(event.sender)) return
    const session = sshSessions.get(id)
    if (session?.worker) {
      try {
        session.worker.postMessage({ type: 'RESIZE', cols, rows })
      } catch {}
    }
  })

  ipcMain.handle('ssh:disconnect', async (event: IpcMainInvokeEvent, id: string) => {  // 处理来自渲染进程的断开连接请求
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    const session = sshSessions.get(id)
    if (session?.worker) {
      sshSessions.delete(id)
      try {
        session.worker.postMessage({ type: 'DISCONNECT' })
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
}

export { setupSSHHandlers }
export type { SshConnectConfig }
