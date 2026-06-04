import type { MainWindowGetter } from '../types/handlers.js'

/** IPC 发送参数类型 */
type IpcSendArg = string | number | boolean | object | null | undefined

/** 
 * 向当前主窗口渲染进程发送 IPC 事件（窗口已销毁时静默跳过）
 * @param getMainWindow 获取主窗口实例
 * @param channel 通道名
 * @param args 发送参数
 * @returns 是否发送成功
 */
export function sendToRenderer(
  getMainWindow: MainWindowGetter,
  channel: string,
  ...args: IpcSendArg[]
) {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, ...args)
  }
}
