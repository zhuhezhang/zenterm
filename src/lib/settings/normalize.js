import {
  DEFAULT_SIDEBAR_WIDTH,
  TERMINAL_SCROLLBACK_DEFAULT, TERMINAL_SCROLLBACK_MIN, TERMINAL_SCROLLBACK_MAX,
  TERMINAL_FONT_SIZE_DEFAULT, TERMINAL_FONT_SIZE_MIN, TERMINAL_FONT_SIZE_MAX,
} from './defaults.js'

/**
 * 将侧边栏宽度限制在窗口可用范围内（与主界面分割条 min/max 一致）
 * @param {unknown} width 侧边栏宽度
 * @param {number} [innerWidth] 窗口可用宽度
 * @returns {number} 限制后的侧边栏宽度
 */
export function clampSidebarWidthPx(width, innerWidth = typeof window !== 'undefined' ? window.innerWidth : 1200) {
  const iw = Math.max(320, Math.floor(Number(innerWidth)) || 1200)
  const min = Math.max(80, Math.floor(iw * 0.10))
  const max = Math.floor(iw * 0.90)
  const w = Math.floor(Number(width))
  if (!Number.isFinite(w)) return DEFAULT_SIDEBAR_WIDTH
  return Math.min(max, Math.max(min, w))
}

/**
 * 将用户输入规范为合法滚动行数；无法解析时用内置默认
 * @param {unknown} raw 用户输入的滚动行数
 * @returns {number} 规范后的滚动行数
 */
export function clampTerminalScrollback(raw) {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n)) return TERMINAL_SCROLLBACK_DEFAULT
  if (n < TERMINAL_SCROLLBACK_MIN) return TERMINAL_SCROLLBACK_MIN
  if (n > TERMINAL_SCROLLBACK_MAX) return TERMINAL_SCROLLBACK_MAX
  return n
}

/**
 * 将用户输入规范为合法终端字号（px）；无法解析时用内置默认
 * @param {unknown} raw 字号
 * @returns {number} 规范后的字号
 */
export function clampTerminalFontSize(raw) {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n)) return TERMINAL_FONT_SIZE_DEFAULT
  if (n < TERMINAL_FONT_SIZE_MIN) return TERMINAL_FONT_SIZE_MIN
  if (n > TERMINAL_FONT_SIZE_MAX) return TERMINAL_FONT_SIZE_MAX
  return n
}

/**
 * 会话日志：none = 关闭；buffer = 与 xterm 屏幕缓冲一致；stream = 下行原始流去 ANSI 后追加
 * @param {unknown} m 用户输入的日志模式
 * @returns {'none'|'stream'|'buffer'} 规范后的日志模式
 */
export function normalizeLoggingMode(m) {
  const v = String(m ?? '').trim().toLowerCase()
  if (v === 'none') return 'none'
  if (v === 'stream') return 'stream'
  return 'buffer'
}

/**
 * 将旧版 enableLogging 并入 loggingMode（删除 enableLogging），并规范 loggingMode
 * @param {Record<string, unknown>} settings 旧版设置对象
 * @returns {Record<string, unknown>} 规范后的设置对象
 */
export function applyLegacyLoggingMigration(settings) {
  if (!settings || typeof settings !== 'object') return settings ?? {}
  const out = { ...settings }
  if ('enableLogging' in out) {
    if (out.enableLogging === true) {
      let mode = normalizeLoggingMode(out.loggingMode)
      if (mode === 'none') mode = 'buffer'
      out.loggingMode = mode
    } else {
      out.loggingMode = 'none'
    }
    delete out.enableLogging
  }
  out.loggingMode = normalizeLoggingMode(out.loggingMode)
  return out
}
