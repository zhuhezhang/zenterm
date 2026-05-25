/**
 * 主进程 → 渲染进程 IPC 统一响应：{ success, content }；失败时另含 errorKnown
 * @typedef {Record<string, unknown>} IpcContent
 * @typedef {{ success: true, content: IpcContent }} IpcOk
 * @typedef {{ success: false, errorKnown: boolean, content: IpcContent & { error: string, errorParams?: Record<string, string|number> } }} IpcFail
 */

/**
 * 成功响应
 * @param {IpcContent} [content]
 * @returns {IpcOk}
 */
export function ipcOk(content = {}) {
  return { success: true, content: { ...content } }
}

/**
 * 失败响应（已知 i18n 错误码）
 * @param {string} code 错误码
 * @param {Record<string, string|number>} [params]
 * @param {IpcContent} [contentExtra] 并入 content 的额外字段（如 ports: []）
 * @param {{ errorKnown?: boolean }} [opts]
 * @returns {IpcFail}
 */
export function ipcFail(code, params, contentExtra, opts = {}) {
  const errorKnown = opts.errorKnown !== false
  /** @type {IpcContent & { error: string }} */
  const content = { error: code, ...(contentExtra || {}) }
  if (params && Object.keys(params).length) content.errorParams = params
  return { success: false, errorKnown, content }
}

/**
 * 失败响应（库/系统原始 message，前端不翻译）
 * @param {string} message
 * @param {IpcContent} [contentExtra]
 * @returns {IpcFail}
 */
export function ipcFailRaw(message, contentExtra) {
  return {
    success: false,
    errorKnown: false,
    content: { error: message, ...(contentExtra || {}) },
  }
}

/**
 * 构造带错误码的 Error（路径策略等 throw 用，后续 ipcFailFromThrown 转为 IPC 响应）
 * @param {string} code
 * @param {Record<string, string|number>} [params]
 */
export function createIpcError(code, params) {
  const err = new Error(code)
  err.ipcCode = code
  err.ipcParams = params || {}
  err.ipcKnown = true
  return err
}

/**
 * 从 throw 的 Error 转为 IPC 响应
 * @param {unknown} e
 * @returns {IpcFail}
 */
export function ipcFailFromThrown(e) {
  if (e && typeof e === 'object' && e.ipcCode) {
    const out = ipcFail(e.ipcCode, e.ipcParams)
    if (e.ipcKnown === false) out.errorKnown = false
    return out
  }
  const msg = e instanceof Error ? e.message : String(e ?? '')
  return ipcFailRaw(msg)
}
