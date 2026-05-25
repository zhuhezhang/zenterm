export { ipcOk, ipcFail, ipcFailRaw } from '../../../shared/ipcResponse.js'

/**
 * 从统一 IPC 响应取出 content（成功/失败均可用）
 * @param {{ content?: Record<string, unknown> } | null | undefined} res
 * @returns {Record<string, unknown>}
 */
export function ipcContent(res) {
  return res?.content && typeof res.content === 'object' ? res.content : {}
}

/**
 * 从失败响应取出 error / errorParams / errorKnown（供展示与抛错）
 * @param {{ success?: boolean, errorKnown?: boolean, content?: Record<string, unknown> } | null | undefined} res
 */
export function ipcErrorFields(res) {
  const c = ipcContent(res)
  return {
    error: String(c.error ?? ''),
    errorParams: /** @type {Record<string, string|number>|undefined} */ (c.errorParams),
    errorKnown: res?.success === false ? res.errorKnown !== false : true,
  }
}

/**
 * 从成功响应取出下载目录等 path 字段
 * @param {import('../../../shared/ipcResponse.js').IpcOk | import('../../../shared/ipcResponse.js').IpcFail | null | undefined} res
 * @returns {string}
 */
export function ipcPathFromResponse(res) {
  if (!res?.success) return ''
  const p = res.content?.path
  return typeof p === 'string' ? p : ''
}
