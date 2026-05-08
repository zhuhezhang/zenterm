/**
 * 记录当前主窗口 webContents.id，仅允许该渲染进程调用高危 IPC（防多窗口 / 嵌套 webview 误用）
 */

/** 当前主窗口 webContents.id */
let trustedWebContentsId = null

/** 设置当前主窗口 webContents.id */
export function setTrustedRendererWebContents(webContents) {
  trustedWebContentsId = webContents && typeof webContents.id === 'number' ? webContents.id : null
}

/** 清除当前主窗口 webContents.id */
export function clearTrustedRendererWebContents() {
  trustedWebContentsId = null
}

/** 检查是否为可信的渲染进程 */
export function isTrustedIpcSender(sender) {
  if (trustedWebContentsId == null || !sender || typeof sender.id !== 'number') return false
  return sender.id === trustedWebContentsId
}

/** 协议类 IPC 拒绝返回值（与现有 success/error 形状一致） */
export const IPC_UNAUTHORIZED = Object.freeze({
  success: false,
  error: 'Unauthorized IPC sender',
})

/** 凭据 IPC 拒绝返回值 */
export const CRED_UNAUTHORIZED = Object.freeze({
  ok: false,
  error: 'Unauthorized IPC sender',
})
