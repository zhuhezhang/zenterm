/**
 * 主进程 → 渲染进程 IPC 统一响应：{ success, content }；失败时另含 errorKnown
 * @typedef {Record<string, unknown>} IpcContent
 * @typedef {{ success: true, content: IpcContent }} IpcOk
 * @typedef {{ success: false, errorKnown: boolean, content: IpcContent & { error: string, errorParams?: Record<string, string|number> } }} IpcFail
 */

/**
 * 成功响应（前端调用后端函数成功时，后端返回的成功响应）
 * @param {IpcContent} [content] 响应内容
 * @returns {IpcOk} 成功响应对象
 */
export function ipcOk(content = {}) {
  return { success: true, content: { ...content } }
}

/**
 * 失败响应（前端调用后端函数失败时，后端返回的错误响应）
 * @param {string} error 错误码（errorKnown 为 true）或库/系统原始 message（errorKnown 为 false）
 * @param {boolean} [errorKnown=false] 是否已知 i18n 错误码；未传时默认为 false（前端不翻译）
 * @param {Record<string, string|number>} [params] 错误参数（如{name: '张三'}），仅 errorKnown 为 true 时写入 errorParams
 * @param {IpcContent} [contentExtra] 并入 content 的额外字段（如 ports: []）
 * @returns {IpcFail} 失败响应对象
 */
export function ipcFail(error, errorKnown = false, params, contentExtra) {
  const content = { error, ...(contentExtra || {}) }
  if (errorKnown && params && Object.keys(params).length) content.errorParams = params
  return { success: false, errorKnown, content }
}

/**
 * 构造带错误码的 Error（路径策略等 throw 用，后续 ipcFailFromThrown 转为 IPC 响应）
 * @param {string} code 错误码
 * @param {Record<string, string|number>} [params] 错误参数（如{name: '张三'}）
 * @returns {Error} 错误对象
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
 * @param {unknown} e 错误对象
 * @returns {IpcFail} 失败响应
 */
export function ipcFailFromThrown(e) {
  if (e && typeof e === 'object' && e.ipcCode) {
    return ipcFail(e.ipcCode, e.ipcKnown !== false, e.ipcParams)
  }
  const msg = e instanceof Error ? e.message : String(e ?? '')
  return ipcFail(msg, false)
}
