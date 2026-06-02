import type { MessagePort } from 'node:worker_threads'
import { ipcFail, ipcFailFromThrown, ipcOk } from './ipcResponse.js'
import type { IpcFail, IpcResult } from '../../shared/ipc.js'
import type { SftpWorkerCmdResultMessage } from '../../shared/workerMessages.js'

/** Worker CMD_RESULT 消息上的元字段（其余并入 ipc content） */
const WORKER_CMD_META = new Set(['type', 'reqId', 'success', 'error', 'errorParams', 'errorKnown'])

/**
 * 构造 Worker → 主进程 CMD_RESULT 消息体
 */
export function buildWorkerCmdResultMessage(
  reqId: number,
  success: boolean,
  extra: Omit<SftpWorkerCmdResultMessage, 'type' | 'reqId' | 'success'> = {},
): SftpWorkerCmdResultMessage {
  return { type: 'CMD_RESULT', reqId, success, ...extra }
}

export function postWorkerCmdResult(
  parentPort: MessagePort,
  reqId: number,
  success: boolean,
  extra: Omit<SftpWorkerCmdResultMessage, 'type' | 'reqId' | 'success'> = {},
) {
  parentPort.postMessage(buildWorkerCmdResultMessage(reqId, success, extra))
}

export function postWorkerCmdOk(
  parentPort: MessagePort,
  reqId: number,
  content: Pick<SftpWorkerCmdResultMessage, 'items'> = {},
) {
  postWorkerCmdResult(parentPort, reqId, true, content)
}

export function postWorkerCmdFail(
  parentPort: MessagePort,
  reqId: number,
  error: string,
  errorKnown = true,
  errorParams?: Record<string, string | number>,
) {
  const extra: Omit<SftpWorkerCmdResultMessage, 'type' | 'reqId' | 'success'> = {
    error: String(error || 'app.unknownError'),
  }
  if (errorParams && Object.keys(errorParams).length) extra.errorParams = errorParams
  if (errorKnown === false) extra.errorKnown = false
  postWorkerCmdResult(parentPort, reqId, false, extra)
}

export function postWorkerCmdFailFromThrown(parentPort: MessagePort, reqId: number, e: unknown) {
  const fail = ipcFailFromThrown(e)
  postWorkerCmdResult(parentPort, reqId, false, {
    error: fail.content.error,
    ...(fail.content.errorParams ? { errorParams: fail.content.errorParams } : {}),
    ...(fail.errorKnown === false ? { errorKnown: false } : {}),
  })
}

function workerCmdResultToIpcFail(msg: SftpWorkerCmdResultMessage): IpcFail {
  const code = typeof msg.error === 'string' ? msg.error : 'app.unknownError'
  const errorKnown = msg.errorKnown !== false
  return ipcFail(code, errorKnown, msg.errorParams)
}

/**
 * Worker CMD_RESULT → ipcOk / ipcFail
 */
export function ipcFromWorkerCmdResult(msg: SftpWorkerCmdResultMessage): IpcResult {
  if (msg.success === true) {
    const content: Record<string, SftpWorkerCmdResultMessage[keyof SftpWorkerCmdResultMessage]> = {}
    for (const [k, v] of Object.entries(msg)) {
      if (!WORKER_CMD_META.has(k)) content[k] = v
    }
    return ipcOk(content as import('../../shared/ipc.js').IpcContent)
  }
  return workerCmdResultToIpcFail(msg)
}

export function ipcFailAsWorkerCmdResult(
  reqId: number,
  error: string,
  errorKnown = true,
  errorParams?: Record<string, string | number>,
): SftpWorkerCmdResultMessage {
  return buildWorkerCmdResultMessage(reqId, false, {
    error,
    ...(errorParams ? { errorParams } : {}),
    ...(errorKnown === false ? { errorKnown: false } : {}),
  })
}
