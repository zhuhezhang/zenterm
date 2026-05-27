/**
 * 解析主进程 IPC 响应（ipcOk / ipcFail 仅在后端构造，前端勿用）
 */

/**
 * @param {{ success?: boolean } | null | undefined} res
 * @returns {boolean}
 */
export function isIpcSuccess(res) {
  return res != null && res.success === true
}

/**
 * @param {{ success?: boolean } | null | undefined} res
 * @returns {boolean}
 */
export function isIpcFailure(res) {
  return res != null && res.success === false
}

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
  if (!isIpcSuccess(res)) return ''
  const p = res.content?.path
  return typeof p === 'string' ? p : ''
}

/**
 * 成功或失败响应中的 ports 列表（如 serial:listPorts 失败时 contentExtra）
 * @param {{ success?: boolean, content?: Record<string, unknown> } | null | undefined} res
 * @returns {unknown[]}
 */
export function ipcPortsFromResponse(res) {
  const ports = ipcContent(res).ports
  return Array.isArray(ports) ? ports : []
}

const VAULT_SECRET_KEYS = ['password', 'privateKey', 'passphrase']

/**
 * credentials:get 成功体 → 明文凭据对象（found !== true 时返回 {}）
 * @param {import('../../types/zterm.d.ts').IpcResult | null | undefined} res
 * @returns {{ password?: string, privateKey?: string, passphrase?: string }}
 */
export function vaultSecretsFromGetResponse(res) {
  if (!isIpcSuccess(res)) return {}
  const c = ipcContent(res)
  if (c.found !== true) return {}
  const secrets = {}
  for (const k of VAULT_SECRET_KEYS) {
    if (typeof c[k] === 'string' && c[k]) secrets[k] = c[k]
  }
  return secrets
}
