import { credFail, ipcFail } from '../../shared/ipcError.js'

/** IPC 鉴权失败（success: false） */
export function ipcUnauthorized() {
  return ipcFail('app.unauthorized')
}

/** 凭据 IPC 鉴权失败（ok: false） */
export function credUnauthorized() {
  return credFail('app.unauthorized')
}
