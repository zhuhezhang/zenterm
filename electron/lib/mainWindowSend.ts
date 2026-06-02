import type { MainWindowGetter } from '../types/handlers.js'

type IpcSendArg = string | number | boolean | object | null | undefined

/** 向当前主窗口渲染进程发送 IPC 事件（窗口已销毁时静默跳过） */
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
