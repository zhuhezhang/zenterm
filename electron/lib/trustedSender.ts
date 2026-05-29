/**
 * 记录当前主窗口 webContents.id，仅允许该渲染进程调用高危 IPC（防多窗口 / 嵌套 webview 误用）
 */
import type { WebContents } from 'electron'

/** 当前主窗口 webContents.id */
let trustedWebContentsId: number | null = null

/** 
 * 设置当前主窗口 webContents.id
 */
export function setTrustedRendererWebContents(webContents: WebContents | null | undefined) {
  trustedWebContentsId = webContents && typeof webContents.id === 'number' ? webContents.id : null
}

/** 清除当前主窗口 webContents.id */
export function clearTrustedRendererWebContents() {
  trustedWebContentsId = null
}

/** 
 * 检查是否为可信的渲染进程
 */
export function isTrustedIpcSender(sender: WebContents) {
  if (trustedWebContentsId == null || !sender || typeof sender.id !== 'number') return false
  return sender.id === trustedWebContentsId
}
