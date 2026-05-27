import { ipcFail, ipcFailFromThrown, ipcOk } from './ipcResponse.js'

/** Worker CMD_RESULT 消息上的元字段（其余并入 ipc content） */
const WORKER_CMD_META = new Set(['type', 'reqId', 'success', 'error', 'errorParams', 'errorKnown'])

/**
 * 构造 Worker → 主进程 CMD_RESULT 消息体
 * @param {number} reqId
 * @param {boolean} success
 * @param {Record<string, unknown>} [extra]
 */
export function buildWorkerCmdResultMessage(reqId, success, extra = {}) {
  return { type: 'CMD_RESULT', reqId, success, ...extra }
}

/**
 * @param {import('worker_threads').MessagePort} parentPort
 * @param {number} reqId
 * @param {boolean} success
 * @param {Record<string, unknown>} [extra]
 */
export function postWorkerCmdResult(parentPort, reqId, success, extra = {}) {
  parentPort.postMessage(buildWorkerCmdResultMessage(reqId, success, extra))
}

/**
 * @param {import('worker_threads').MessagePort} parentPort
 * @param {number} reqId
 * @param {Record<string, unknown>} [content]
 */
export function postWorkerCmdOk(parentPort, reqId, content = {}) {
  postWorkerCmdResult(parentPort, reqId, true, content)
}

/**
 * @param {import('worker_threads').MessagePort} parentPort
 * @param {number} reqId
 * @param {string} error
 * @param {boolean} [errorKnown=true]
 * @param {Record<string, string|number>} [errorParams]
 */
export function postWorkerCmdFail(parentPort, reqId, error, errorKnown = true, errorParams) {
  const extra = { error: String(error || 'app.unknownError') }
  if (errorParams && Object.keys(errorParams).length) extra.errorParams = errorParams
  if (errorKnown === false) extra.errorKnown = false
  postWorkerCmdResult(parentPort, reqId, false, extra)
}

/**
 * @param {import('worker_threads').MessagePort} parentPort
 * @param {number} reqId
 * @param {unknown} e
 */
export function postWorkerCmdFailFromThrown(parentPort, reqId, e) {
  const fail = ipcFailFromThrown(e)
  postWorkerCmdResult(parentPort, reqId, false, {
    error: fail.content.error,
    ...(fail.content.errorParams ? { errorParams: fail.content.errorParams } : {}),
    ...(fail.errorKnown === false ? { errorKnown: false } : {}),
  })
}

/**
 * Worker CMD_RESULT 或已是 ipcFail 的对象 → ipcOk / ipcFail
 * @param {Record<string, unknown> | null | undefined} msg
 */
export function ipcFromWorkerCmdResult(msg) {
  if (!msg || typeof msg !== 'object') return ipcFail('app.invalidRequest', true)
  if (msg.success === false && msg.content && typeof msg.content === 'object' && 'errorKnown' in msg) {
    return /** @type {import('./ipcResponse.js').IpcFail} */ (msg)
  }
  if (msg.success === true) {
    const content = {}
    for (const [k, v] of Object.entries(msg)) {
      if (!WORKER_CMD_META.has(k)) content[k] = v
    }
    return ipcOk(content)
  }
  if (msg.success === false) {
    const code = typeof msg.error === 'string' ? msg.error : 'app.unknownError'
    const errorKnown = msg.errorKnown !== false
    return ipcFail(code, errorKnown, /** @type {Record<string, string|number>} */ (msg.errorParams))
  }
  return ipcFail('app.invalidRequest', true)
}
