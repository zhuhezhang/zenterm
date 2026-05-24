/** IPC 错误码前缀 (主进程返回, 渲染进程 translateRender 翻译) */
const IPC_ERROR_PREFIX = /^(app|credentials|sftp|serial|ssh|telnet)\.[a-zA-Z0-9.]+$/

/**
 * 解析错误展示类型
 * @param {unknown} known 错误展示类型
 * @returns {boolean | undefined} 错误展示类型
 */
function normalizeErrorKnown(known) {
  if (known === true) return true
  if (known === false) return false
  return undefined
}

/**
 * 是否为应用层 IPC 错误码 (非库原始英文)
 * @param {unknown} s 错误码
 */
export function isIpcErrorCode(s) {
  return typeof s === 'string' && IPC_ERROR_PREFIX.test(s)
}

/**
 * 构造带错误码的 Error (路径策略等 throw 用)
 * @param {string} code 错误码 (如 sftp.pathErrors.localFileDenied)
 * @param {Record<string, string|number>} [params] 参数（如{name: '张三'}）
 */
export function createIpcError(code, params) {
  const err = new Error(code)
  err.ipcCode = code
  err.ipcParams = params || {}
  err.ipcKnown = true
  return err
}

/**
 * IPC 失败载荷 { success: false, error, errorKnown?, errorParams? } (凭据/SSH/SFTP 等共用)
 * @param {string} code 错误码
 * @param {Record<string, string|number>} [params] 参数（如{name: '张三'}）
 */
export function ipcFail(code, params) {
  const out = { success: false, error: code, errorKnown: true }
  if (params && Object.keys(params).length) out.errorParams = params
  return out
}

/**
 * 从 throw 的 Error 转为 IPC 载荷 (error 为码或库原始 message)
 * @param {unknown} e 错误
 */
export function ipcFailFromThrown(e) {
  if (e && typeof e === 'object' && isIpcErrorCode(e.ipcCode)) {
    const out = ipcFail(e.ipcCode, e.ipcParams)
    if (normalizeErrorKnown(e.ipcKnown) === false) out.errorKnown = false
    return out
  }
  const msg = e instanceof Error ? e.message : String(e ?? '')
  if (isIpcErrorCode(msg)) return ipcFail(msg)
  return { success: false, error: msg, errorKnown: false }
}

/** 
 * 将 IPC 响应转为 Error (保留 errorParams / errorKnown 供 formatThrownIpcError) 
 * @param {{ error?: string, errorParams?: Record<string, string|number>, errorKnown?: boolean }} res IPC 响应
 * @returns {Error} 错误
 */
export function ipcErrorFromResponse(res) {
  const e = new Error(String(res?.error ?? ''))
  if (res?.errorParams) e.errorParams = res.errorParams
  e.errorKnown = res?.errorKnown !== false
  return e
}
