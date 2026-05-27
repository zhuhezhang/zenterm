import { ipcContent, ipcErrorFields, isIpcSuccess } from './ipcResponse'
import type { IpcThrownError } from '../../types/errors'

/**
 * 将 IPC 响应转为 Error (保留 errorParams / errorKnown 供 formatThrownIpcError)
 */
export function ipcErrorFromResponse(res: {
  success?: boolean
  errorKnown?: boolean
  content?: Record<string, unknown>
}): IpcThrownError {
  const { error, errorParams, errorKnown } = ipcErrorFields(res)
  const e = new Error(error) as IpcThrownError
  if (errorParams) e.errorParams = errorParams
  e.errorKnown = errorKnown
  return e
}

/**
 * 非 success 时抛出 ipcErrorFromResponse；用于 await invoke 后的统一校验
 * @param {{ success?: boolean, errorKnown?: boolean, content?: Record<string, unknown> } | null | undefined} res
 * @returns {NonNullable<typeof res>}
 */
export function assertIpcSuccess(res) {
  if (!isIpcSuccess(res)) {
    throw ipcErrorFromResponse(
      res ?? { success: false, errorKnown: true, content: { error: 'app.invalidRequest' } },
    )
  }
  return res
}

/**
 * assertIpcSuccess + 返回 content
 * @param {{ success?: boolean, content?: Record<string, unknown> } | null | undefined} res
 * @returns {Record<string, unknown>}
 */
export function unwrapIpcOk(res) {
  return ipcContent(assertIpcSuccess(res))
}
