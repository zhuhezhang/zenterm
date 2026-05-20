import {
  DEFAULT_SIDEBAR_WIDTH, TERMINAL_SCROLLBACK_DEFAULT, TERMINAL_SCROLLBACK_MIN, TERMINAL_SCROLLBACK_MAX,
} from './defaults.js'

/**
 * 将侧边栏宽度限制在窗口可用范围内（与主界面分割条 min/max 一致）
 * @param {unknown} width 侧边栏宽度
 * @param {number} [innerWidth] 窗口可用宽度
 * @returns {number} 限制后的侧边栏宽度
 */
export function clampSidebarWidthPx(
  width,
  innerWidth = typeof window !== 'undefined' ? window.innerWidth : 1200,
  fallback = DEFAULT_SIDEBAR_WIDTH,
) {
  const iw = Math.max(320, Math.floor(Number(innerWidth)) || 1200)
  const min = Math.max(80, Math.floor(iw * 0.10))
  const max = Math.floor(iw * 0.90)
  const w = Math.floor(Number(width))
  if (!Number.isFinite(w)) return fallback
  return Math.min(max, Math.max(min, w))
}

/**
 * 将用户输入规范为合法滚动行数；无法解析时用内置默认
 * @param {unknown} raw 用户输入的滚动行数
 * @returns {number} 规范后的滚动行数
 */
export function clampTerminalScrollback(raw, fallback = TERMINAL_SCROLLBACK_DEFAULT) {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n)) return fallback
  if (n < TERMINAL_SCROLLBACK_MIN) return TERMINAL_SCROLLBACK_MIN
  if (n > TERMINAL_SCROLLBACK_MAX) return TERMINAL_SCROLLBACK_MAX
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
 * 判断路径是否像绝对路径（与设置界面选择目录后的校验条件一致）
 * @param {string} p 路径
 * @returns {boolean}
 */
export function isLikelyAbsoluteLogPath(p) {
  const s = String(p ?? '').trim()
  if (!s) return false
  return s.startsWith('/') || s.startsWith('\\') || /^[a-zA-Z]:[\\/]/.test(s)
}

/**
 * 导入设置时规范 logPath：非字符串用 fallback；空白为 ''；绝对路径校验失败则 fallback
 * @param {unknown} raw 导入的 logPath
 * @param {string} [fallback] 非法时回退路径（通常为当前设置）
 * @returns {Promise<string>}
 */
export async function normalizeImportedLogPath(raw, fallback = '') {
  const fb = typeof fallback === 'string' ? fallback : ''
  if (typeof raw !== 'string') return fb
  const p = raw.trim()
  if (!p) return ''
  try {
    if (typeof window !== 'undefined' && window.zterm?.validateLogDirectory && isLikelyAbsoluteLogPath(p)) {
      const vr = await window.zterm.validateLogDirectory(p)
      if (!vr?.ok) return fb
    }
    return p
  } catch {
    return fb
  }
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
