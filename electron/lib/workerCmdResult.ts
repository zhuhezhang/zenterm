import type { MessagePort } from 'node:worker_threads'
import { ipcFail, ipcFailFromThrown, ipcOk } from './ipcResponse.js'
import type { IpcFail, IpcResult } from '../../shared/ipc.js'
import type { SftpWorkerCmdResultMessage } from '../types/workerMessages.js'

/** Worker CMD_RESULT 消息上的元字段（其余并入 ipc content） */
const WORKER_CMD_META = new Set(['type', 'reqId', 'success', 'error', 'errorParams', 'errorKnown'])

/**
 * 构造 Worker → 主进程 CMD_RESULT 消息体
 * @param reqId 请求 ID
 * @param success 是否成功
 * @param extra 额外字段
 * @returns Worker → 主进程 CMD_RESULT 消息体
 */
export function buildWorkerCmdResultMessage(
  reqId: number,
  success: boolean,
  extra: Omit<SftpWorkerCmdResultMessage, 'type' | 'reqId' | 'success'> = {},
): SftpWorkerCmdResultMessage {
  return { type: 'CMD_RESULT', reqId, success, ...extra }
}

/**
 * 发送 Worker → 主进程 CMD_RESULT 消息
 * @param parentPort 父线程端口
 * @param reqId 请求 ID
 * @param success 是否成功
 * @param extra 额外字段
 */
export function postWorkerCmdResult(
  parentPort: MessagePort,
  reqId: number,
  success: boolean,
  extra: Omit<SftpWorkerCmdResultMessage, 'type' | 'reqId' | 'success'> = {},
) {
  parentPort.postMessage(buildWorkerCmdResultMessage(reqId, success, extra))
}

/**
 * 发送 Worker → 主进程 CMD_RESULT 成功消息
 * @param parentPort 父线程端口
 * @param reqId 请求 ID
 * @param content 内容
 */
export function postWorkerCmdOk(
  parentPort: MessagePort,
  reqId: number,
  content: Pick<SftpWorkerCmdResultMessage, 'items'> = {},
) {
  postWorkerCmdResult(parentPort, reqId, true, content)
}

/**
 * 发送 Worker → 主进程 CMD_RESULT 失败消息
 * @param parentPort 父线程端口
 * @param reqId 请求 ID
 * @param error 错误信息
 * @param errorKnown 是否已知错误
 * @param errorParams 错误参数
 */
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

/**
 * 发送 Worker → 主进程 CMD_RESULT 失败消息（从抛出异常转换）
 * @param parentPort 父线程端口
 * @param reqId 请求 ID
 * @param e 异常
 */
export function postWorkerCmdFailFromThrown(parentPort: MessagePort, reqId: number, e: unknown) {
  const fail = ipcFailFromThrown(e)
  postWorkerCmdResult(parentPort, reqId, false, {
    error: fail.content.error,
    ...(fail.content.errorParams ? { errorParams: fail.content.errorParams } : {}),
    ...(fail.errorKnown === false ? { errorKnown: false } : {}),
  })
}

/**
 * 将 Worker CMD_RESULT 消息转换为 ipcFail
 * @param msg Worker CMD_RESULT 消息
 * @returns ipcFail
 */
function workerCmdResultToIpcFail(msg: SftpWorkerCmdResultMessage): IpcFail {
  const code = typeof msg.error === 'string' ? msg.error : 'app.unknownError'
  const errorKnown = msg.errorKnown !== false
  return ipcFail(code, errorKnown, msg.errorParams)
}

/**
 * 将 Worker CMD_RESULT 消息转换为 ipcOk / ipcFail
 * @param msg Worker CMD_RESULT 消息
 * @returns ipcOk / ipcFail
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

/**
 * 将 ipcFail 转换为 Worker CMD_RESULT 消息
 * @param reqId 请求 ID
 * @param error 错误信息
 * @param errorKnown 是否已知错误
 * @param errorParams 错误参数
 * @returns Worker CMD_RESULT 消息
 */
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
