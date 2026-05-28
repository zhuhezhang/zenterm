import type { MessagePort } from 'node:worker_threads'
import { ipcFail, ipcFailFromThrown, ipcOk } from './ipcResponse.js'
import type { IpcFail, IpcResult } from '../../shared/ipc.js'

/** Worker CMD_RESULT 消息上的元字段（其余并入 ipc content） */
const WORKER_CMD_META = new Set(['type', 'reqId', 'success', 'error', 'errorParams', 'errorKnown'])

/**
 * 构造 Worker → 主进程 CMD_RESULT 消息体
 */
export function buildWorkerCmdResultMessage(
  reqId: number,
  success: boolean,
  extra: Record<string, unknown> = {},
) {
  return { type: 'CMD_RESULT', reqId, success, ...extra }
}

export function postWorkerCmdResult(
  parentPort: MessagePort,
  reqId: number,
  success: boolean,
  extra: Record<string, unknown> = {},
) {
  parentPort.postMessage(buildWorkerCmdResultMessage(reqId, success, extra))
}

export function postWorkerCmdOk(
  parentPort: MessagePort,
  reqId: number,
  content: Record<string, unknown> = {},
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
  const extra: Record<string, unknown> = { error: String(error || 'app.unknownError') }
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

/**
 * Worker CMD_RESULT 或已是 ipcFail 的对象 → ipcOk / ipcFail
 */
export function ipcFromWorkerCmdResult(msg: unknown): IpcResult {
  if (!msg || typeof msg !== 'object') return ipcFail('app.invalidRequest', true)
  const record = msg as Record<string, unknown>
  if (record.success === false && record.content && typeof record.content === 'object' && 'errorKnown' in record) {
    return record as unknown as IpcFail
  }
  if (record.success === true) {
    const content: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(record)) {
      if (!WORKER_CMD_META.has(k)) content[k] = v
    }
    return ipcOk(content)
  }
  if (record.success === false) {
    const code = typeof record.error === 'string' ? record.error : 'app.unknownError'
    const errorKnown = record.errorKnown !== false
    return ipcFail(code, errorKnown, record.errorParams as Record<string, string | number> | undefined)
  }
  return ipcFail('app.invalidRequest', true)
}
