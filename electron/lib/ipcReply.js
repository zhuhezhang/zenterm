import { ipcFail } from '../../shared/ipcError.js'

/** IPC 鉴权失败 */
export function ipcUnauthorized() {
  return ipcFail('app.unauthorized')
}
