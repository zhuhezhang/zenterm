/**
 * 解析错误展示类型
 * @param {unknown} known 错误展示类型
 * @returns {boolean | undefined} 规范化后的错误展示类型
 */
function normalizeErrorKnown(known) {
  if (known === true) return true
  if (known === false) return false
  return undefined
}

/**
 * 构造带错误码的 Error (路径策略等 throw 用，后续通过 ipcFailFromThrown 转为 IPC 响应)
 * @param {string} code 错误码 (如 sftp.pathErrors.localFileDenied)
 * @param {Record<string, string|number>} [params] 参数（如{name: '张三'}）
 * @returns {Error & { ipcCode: string, ipcParams: Record<string, string|number>, ipcKnown: boolean }} 错误对象
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
 * @returns {{ success: false, error: string, errorKnown: boolean, errorParams?: Record<string, string|number> }} IPC 失败载荷
 */
export function ipcFail(code, params) {
  const out = { success: false, error: code, errorKnown: true }
  if (params && Object.keys(params).length) out.errorParams = params
  return out
}

/**
 * 从 throw 的 Error 转为 IPC 载荷 (error 为码或库原始 message)
 * @param {unknown} e 错误
 * @returns {{ success: false, error: string, errorKnown: boolean, errorParams?: Record<string, string|number> }} IPC 失败载荷
 */
export function ipcFailFromThrown(e) {
  if (e && typeof e === 'object' && e.ipcCode) {
    const out = ipcFail(e.ipcCode, e.ipcParams)
    if (normalizeErrorKnown(e.ipcKnown) === false) out.errorKnown = false
    return out
  }
  const msg = e instanceof Error ? e.message : String(e ?? '')
  return { success: false, error: msg, errorKnown: false }
}

/** 
 * 将 IPC 响应转为 Error (保留 errorParams / errorKnown 供 formatThrownIpcError) 
 * @param {{ error?: string, errorParams?: Record<string, string|number>, errorKnown?: boolean }} res IPC 响应
 * @returns {Error & { errorParams?: Record<string, string|number>, errorKnown?: boolean }} 错误对象
 */
export function ipcErrorFromResponse(res) {
  const e = new Error(String(res?.error ?? ''))
  if (res?.errorParams) e.errorParams = res.errorParams
  e.errorKnown = res?.errorKnown !== false
  return e
}
