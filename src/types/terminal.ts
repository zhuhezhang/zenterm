import type { Terminal } from '@xterm/xterm'

/** 终端面板内会话日志控制器（buffer / stream 模式） */
export interface SessionLogHandle {
  scheduleSnapshot?: () => void
  enqueue?: (s: string) => void
  flushNow?: () => void
  setTerminal?: (term: Terminal) => void
}
