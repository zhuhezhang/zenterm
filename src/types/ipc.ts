/** IPC 类型与主进程 ipcOk/ipcFail 契约（定义在 shared/ipc.ts） */

export type {
  IpcContent,
  IpcOk,
  IpcFail,
  IpcResult,
  IpcError,
} from '../../shared/ipc'

export { isIpcError } from '../../shared/ipc'
