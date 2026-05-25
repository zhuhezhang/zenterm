import { ipcErrorFields } from './ipcResponse.js'

/**
 * 将 IPC 响应转为 Error (保留 errorParams / errorKnown 供 formatThrownIpcError)
 * @param {{ success?: boolean, errorKnown?: boolean, content?: Record<string, unknown> }} res IPC 响应
 */
export function ipcErrorFromResponse(res) {
  const { error, errorParams, errorKnown } = ipcErrorFields(res)
  const e = new Error(error)
  if (errorParams) e.errorParams = errorParams
  e.errorKnown = errorKnown
  return e
}
