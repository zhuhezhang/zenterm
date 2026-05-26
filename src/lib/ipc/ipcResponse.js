/**
 * 解析主进程 IPC 响应（ipcOk / ipcFail 仅在后端构造，前端勿用）
 */


/**
 * 从统一 IPC 响应取出 content（成功/失败均可用）
 * @param {{ content?: Record<string, unknown> } | null | undefined} res 响应对象
 * @returns {Record<string, unknown>} 响应内容
 */
export function ipcContent(res) {
  return res?.content && typeof res.content === 'object' ? res.content : {}
}

/**
 * 从失败响应取出 error / errorParams / errorKnown（供展示与抛错）
 * @param {{ success?: boolean, errorKnown?: boolean, content?: Record<string, unknown> } | null | undefined} res 响应对象
 * @returns {{ error: string, errorParams: Record<string, string|number>|undefined, errorKnown: boolean }} 错误字段
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
 * @param {import('../../types/zterm.d.ts').IpcResult | null | undefined} res 响应对象
 * @returns {string} 下载目录
 */
export function ipcPathFromResponse(res) {
  if (!res?.success) return ''
  const p = res.content?.path
  return typeof p === 'string' ? p : ''
}
