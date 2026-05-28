import { useEffect, useRef, type MutableRefObject } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import {
  decodeIncomingTerminalWire,
  sessionTerminalEncoding,
} from '../lib/terminalEncodingService'
import { resolveLoggingDirectory } from '../store/settingsStore'
import { clampTerminalScrollback, normalizeLoggingMode } from '../lib/settings/normalize'
import { translateRender } from '../i18n/translateRender'
import { resolveEffectiveUiLanguage } from '../lib/resolveUiLanguage'
import { safeFileToken } from '../lib/safeFileName'
import { assertIpcSuccess } from '../lib/ipc/ipcError'
import { getZterm } from '@/lib/ipc/getZterm'
import { formatThrownIpcError } from '@/lib/ipc/formatIpcError'
import { getXtermTheme } from '../theme/appTheme'
import '@xterm/xterm/css/xterm.css'
import type { TerminalPanelProps } from '../types/components'
import type { ActiveSession, SessionType } from '../types/session'
import type { AppSettings } from '../types/settings'
import type { SessionLogHandle } from '../types/terminal'
import '../styles/terminal.css'

/**

 * TerminalPanel 组件：负责渲染终端界面、管理终端实例和连接会话
 * @param {Object} props 组件属性
 * @param {Object} props.session 会话对象，包含连接信息和状态
 * @param {Boolean} props.active 是否为当前活跃标签页
 * @param {Function} props.onUpdate 会话状态更新回调函数
 * @param {Object} props.settings 全局设置对象，包含用户偏好设置
 * @param {'dark'|'light'} props.appThemeEffective 应用亮暗（与界面 CSS 变量一致），用于 xterm 配色
 * @param {Function} props.onRegisterExport 注册导出终端输出函数的回调，参数为 (sessionId, getter|null)
 * @param {Function} [props.onRegisterClearScreen] 注册清屏函数的回调，参数为 (sessionId, fn|null)
 */
export default function TerminalPanel({
  session,
  active,
  onUpdate,
  settings,
  appThemeEffective = 'dark',
  onRegisterExport,
  onRegisterClearScreen,
}: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const cleanupRef = useRef<Array<() => void>>([])
  const logFileRef = useRef<SessionLogHandle | null>(null)
  const logFileStemStateRef = useRef<{ sessionId: string | null; stem: string | null }>({
    sessionId: null,
    stem: null,
  })
  const disconnectedRef = useRef(false)
  const settingsRef = useRef<AppSettings>(settings)
  useEffect(() => { settingsRef.current = settings }, [settings])

  useEffect(() => {  // 组件初次挂载时：创建终端实例、连接会话，并设置相关事件监听器；组件卸载时：调用 cleanupRef 中的函数进行清理
    if (!containerRef.current) return
    const term = createTerminal(appThemeEffective, clampTerminalScrollback(settingsRef.current?.terminalScrollback))
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())  // WebLinksAddon 负责将终端中的 URL 自动识别为可点击链接
    term.open(containerRef.current)  // 将 xterm 实例挂载到 containerRef.current 指向的 DOM 元素上
    fitAddon.fit()  // 初始调整终端尺寸以适应容器大小
    termRef.current     = term
    fitAddonRef.current = fitAddon

    applyTerminalSettings(term, settingsRef)

    let cancelled = false
    connectSession(term, fitAddon, session, onUpdate, cleanupRef, disconnectedRef, () => cancelled, logFileRef, settingsRef)

    const logOnResize = term.onResize(() => {
      if (normalizeLoggingMode(settingsRef.current?.loggingMode) === 'buffer') {
        logFileRef.current?.scheduleSnapshot?.()
      }
    })
    cleanupRef.current.push(() => { try { logOnResize.dispose() } catch (e) {} })

    const ro = new ResizeObserver(() => { try { fitAddon.fit() } catch (e) {} })  // 监听容器尺寸变化，调整终端尺寸以适应新的容器大小
    ro.observe(containerRef.current)
    cleanupRef.current.push(() => ro.disconnect())  // 将 ResizeObserver 的断开函数添加到 cleanupRef 中，以便组件卸载时调用来停止监听尺寸变化

    return () => {  // 清理：卸载时取消连接、清理监听器、刷盘会话日志、销毁终端
      cancelled = true
      cleanupRef.current.forEach(fn => { try { fn() } catch (e) {} })
      cleanupRef.current = []
      try { logFileRef.current?.flushNow?.() } catch (_) {}
      logFileRef.current = null
      term.dispose()
    }
  }, [session.id])

  /** 日志：写入方式或目录变化时重建控制器并绑定当前终端 */
  useEffect(() => {
    const term = termRef.current
    if (normalizeLoggingMode(settings.loggingMode) === 'none') {
      try { logFileRef.current?.flushNow?.() } catch (_) {}
      logFileRef.current = null
      return
    }
    setupLogging(session, settings, logFileRef, logFileStemStateRef, settingsRef)
    if (term) logFileRef.current?.setTerminal?.(term)
  }, [session.id, settings.loggingMode, settings.logPath])

  useEffect(() => {  // 滚动缓冲行数：保存设置后更新已存在终端（xterm 支持运行时改 options.scrollback）
    const term = termRef.current
    if (!term) return
    const sb = clampTerminalScrollback(settings?.terminalScrollback)
    if (term.options.scrollback !== sb) {
      term.options.scrollback = sb
    }
  }, [settings?.terminalScrollback])

  useEffect(() => {  // 监听当应用主题变化时，更新终端主题，确保终端主题与应用主题一致
    const term = termRef.current
    if (!term) return
    term.options.theme = getXtermTheme(appThemeEffective)
    try {
      term.refresh(0, term.rows - 1)
    } catch (_) {}
  }, [appThemeEffective])

  useEffect(() => {  // 当 active 状态变化时，如果当前标签页变为活跃，则调整终端尺寸并聚焦终端，确保用户界面正确显示并且用户可以立即输入
    if (active && fitAddonRef.current) {
      setTimeout(() => { try { fitAddonRef.current?.fit() } catch (e) {} ; termRef.current?.focus() }, 50)
    }
  }, [active])

  useEffect(() => {  // 注册导出终端输出函数：当组件挂载时，注册导出终端输出函数，当组件卸载时，卸载导出终端输出函数
    const getter = () => exportTerminalBuffer(termRef.current)
    onRegisterExport?.(session.id, getter)
    return () => onRegisterExport?.(session.id, null)
  }, [session.id, onRegisterExport])

  useEffect(() => {  // 注册清屏：供标签栏右键菜单调用 xterm.clear()
    const clear = () => {
      const term = termRef.current
      if (!term) return
      try {
        term.clear()
      } catch (_) {}
      logFileRef.current?.scheduleSnapshot?.()
    }
    onRegisterClearScreen?.(session.id, clear)
    return () => onRegisterClearScreen?.(session.id, null)
  }, [session.id, onRegisterClearScreen])

  useEffect(() => {  // 监听按键事件：当连接断开时，按 R 键触发重连逻辑，重新连接会话并设置相关事件监听器
    const term = termRef.current
    if (!term) return
    const d = term.onKey(({ key }) => {
      if (disconnectedRef.current && (key === 'r' || key === 'R')) {  // 只有在连接断开状态下按 R 键才触发重连，避免误操作导致不必要的连接尝试
        disconnectedRef.current = false
        cleanupRef.current.forEach(fn => { try { fn() } catch (e) {} })  // 调用 cleanupRef 中的函数清理之前的连接状态和事件监听器，确保重连时不会有遗留的状态或监听器干扰新的连接
        cleanupRef.current = []
        try { logFileRef.current?.flushNow?.() } catch (_) {}  // 先刷盘，再换日志控制器
        const container = containerRef.current
        const fitAddon = fitAddonRef.current
        if (!container || !fitAddon) return
        const ro = new ResizeObserver(() => { try { fitAddonRef.current?.fit() } catch (e) {} })  // 重连时要重新监听容器尺寸变化
        ro.observe(container)
        cleanupRef.current.push(() => ro.disconnect())
        setupLogging(session, settingsRef.current, logFileRef, logFileStemStateRef, settingsRef)  // 重连：复用本标签页首次连接时的日志文件
        logFileRef.current?.setTerminal?.(term)
        writelnWithLog(term, logFileRef, `\r\x1b[33m${translateRender(resolveEffectiveUiLanguage(settings?.uiLanguage), 'terminal.reconnecting')}\x1b[0m`)
        connectSession(term, fitAddon, session, onUpdate, cleanupRef, disconnectedRef, () => false, logFileRef, settingsRef)
      }
    })
    return () => d.dispose()
  }, [session.id, settings.uiLanguage])

  return (
    <div className={`terminal-panel ${active ? 'active' : ''}`} style={{ display: active ? 'flex' : 'none' }}>
      <div ref={containerRef} className="terminal-container" />
    </div>
  )
}

function exportTerminalBuffer(term: Terminal | null): string {
  if (!term) return ''
  const buf = term.buffer.active
  const lines = []
  for (let i = 0; i < buf.length; i++) {
    const line = buf.getLine(i)
    if (!line) continue
    lines.push(line.translateToString(true).replace(/\u00a0/g, ' '))
  }
  return lines.join('\n').trimEnd()
}

/**
 * 写入一行终端内容并按当前日志模式记入会话日志
 * @param {import('@xterm/xterm').Terminal} term xterm 终端实例
 * @param {{ current: { scheduleSnapshot?: () => void, enqueue?: (s: string) => void } | null }} logRef 日志引用，包含 scheduleSnapshot 和 enqueue 方法
 * @param {string} lineForWriteln 传给 term.writeln 的字符串（不含结尾换行），用于写入终端
 */
function writelnWithLog(
  term: Terminal,
  logRef: MutableRefObject<SessionLogHandle | null>,
  lineForWriteln: string,
): void {
  term.writeln(lineForWriteln)
  logRef.current?.scheduleSnapshot?.()
  logRef.current?.enqueue?.(lineForWriteln + '\r\n')
}

/**
 * 规范化用户输入，兼容部分设备对退格键的不同解释
 * - 一些设备将 DEL(0x7f) 解释为“向前删除”，会导致必须先左移光标才能删除字符
 * - 对 Telnet/Serial 会话把 DEL 转为 BS(0x08)，更符合设备控制台习惯
 * @param {'ssh'|'telnet'|'serial'} type 会话类型
 * @param {string} data xterm 原始输入数据
 * @param {Object|null|undefined} session 当前会话（含 per-session backspaceMode）
 * @returns {string} 规范化后的数据
 */
function normalizeInputData(type: SessionType | string, data: string, session: ActiveSession): string {
  const mode = String(session?.backspaceMode || 'auto').toLowerCase()
  if (mode === 'del') return data.replace(/\x08/g, '\x7f')
  if (mode === 'bs') return data.replace(/\x7f/g, '\x08')
  // Auto：SSH 默认保留 DEL；Telnet/Serial 默认转为 BS，兼容更多设备
  if (type === 'telnet' || type === 'serial') return data.replace(/\x7f/g, '\x08')
  return data
}

/**
 * 解析十六进制颜色字符串，支持 #RGB 和 #RRGGBB 格式，返回 RGB 数组
 * @param {string} hex 十六进制颜色字符串
 * @returns {[number, number, number]} RGB 数组，如果输入无效则返回黄色 [255, 255, 0] 作为默认值
 */
function parseHexColor(hex: string): [number, number, number] {
  if (!hex || typeof hex !== 'string') return [255, 255, 0]
  let raw = hex.trim()
  if (raw.startsWith('#')) raw = raw.slice(1)
  if (raw.length === 3) raw = raw.split('').map(ch => ch + ch).join('')
  if (raw.length !== 6) return [255, 255, 0]
  const value = parseInt(raw, 16)
  if (Number.isNaN(value)) return [255, 255, 0]
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/**
 * 应用高亮规则
 * @param {string} text 要应用高亮规则的文本
 * @param {Object} settings 设置对象
 * @returns {string} 应用高亮规则后的文本
 */
function applyHighlightRules(text: string, settings: AppSettings | undefined): string {
  if (!text || !settings?.highlightRules?.length) return text
  let output = text
  for (const rule of settings.highlightRules) {
    if (!rule?.enabled || !rule.pattern?.trim()) continue
    let regex
    try {
      const pattern = rule.useRegex === false
        ? String(rule.pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        : rule.pattern
      const flags = rule.caseSensitive === true ? 'g' : 'gi'
      regex = new RegExp(pattern, flags)
    } catch (e) {
      continue
    }
    const [r, g, b] = parseHexColor(rule.color)
    const ansi = `\x1b[38;2;${r};${g};${b}m`
    output = output.replace(regex, (match: string) => `${ansi}${match}\x1b[0m`)
  }
  return output
}

/**
 * 返回第一个行结束序列最后一个字符的下标（支持 \r\n、\n、单独 \r），无则 -1。
 * 串口常按字节小块到达，高亮需在累积文本上匹配；按行切分可减少跨块断词。
 * @param {string} s 文本字符串
 * @returns {number} 下标
 */
function nextLineBreakEndIndex(s: string): number {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c === 0x0a) return i
    if (c === 0x0d) {
      if (s.charCodeAt(i + 1) === 0x0a) return i + 1
      return i
    }
  }
  return -1
}

/**
 * 创建并配置 xterm 终端实例
 * @param {'dark'|'light'} themeMode 主题名称
 * @param {number} scrollback 滚动缓冲行数（由设置 clamp）
 * @returns {Terminal} 配置好的 Terminal 实例
 */
function createTerminal(themeMode: 'dark' | 'light', scrollback: number): Terminal {
  return new Terminal({
    fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Menlo, monospace',  // 左到右为字体的优先级
    fontSize: 14,
    lineHeight: 1.4,
    cursorBlink: true,  // 启用光标闪烁，增强可见性
    cursorStyle: 'bar',  // 光标样式为竖线，适合现代终端习惯
    allowTransparency: true,  // 允许背景透明，配合主题颜色可以实现半透明效果
    scrollback,  // 滚动缓冲行数
    windowsMode: false,  // 关闭 Windows 模式（影响换行符处理），启用更现代的行为和样式
    theme: getXtermTheme(themeMode),  // 获取 xterm 主题
  })
}

/**
 * 应用终端交互设置：根据用户设置启用选中复制和右键粘贴功能
 * @param {Terminal} term - xterm 终端实例
 * @param {Object} settingsRef 设置对象的引用，包含用户偏好设置
 */
function applyTerminalSettings(
  term: Terminal,
  settingsRef: MutableRefObject<AppSettings>,
): void {
  term.onSelectionChange(() => {  // 监听选中时复制：通过 settingsRef 实时读取，保证设置变化后立即生效
    const interact = settingsRef.current?.terminalInteract ?? true  // ?? 是空值合并运算符，表示如果 terminalInteract 不为 null 或 undefined 则使用它，否则默认 true
    if (!interact) return
    const sel = term.getSelection()
    if (sel && sel.length > 0) {
      navigator.clipboard?.writeText(sel).catch(() => {})
    }
  })
  
  const addCtx = () => {  // 右键粘贴：等 term.element 挂载后注册
    if (!term.element) { setTimeout(addCtx, 50); return }  // addCtx 函数递归检查 term.element 是否存在（xterm.js 挂载后才可用），不存在则 50ms 后重试
    term.element.addEventListener('contextmenu', async (e: MouseEvent) => {  // 在 term.element 上监听 contextmenu（右键菜单）事件
      const interact = settingsRef.current?.terminalInteract ?? true
      if (!interact) return
      e.preventDefault()
      try { const t = await navigator.clipboard.readText(); term.paste(t) } catch {}
    })
  }
  addCtx()
}

/**
 * 去掉已完整的 ANSI/OSC 等转义序列（CSI 如 [33m、[42D；OSC 至 BEL 或 ST 等）
 * @param {string} s 文本字符串
 * @returns {string} 去掉已完整的 ANSI/OSC 等转义序列后的文本
 */
function stripCompleteAnsiEscapes(s: string): string {
  if (!s) return ''
  return s
    .replace(/\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, '')
    .replace(/\u009b[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b\][^\x1b]*\x1b\\/g, '')
    .replace(/\x1b[\x20-\x2f][\x40-\x7e]/g, '')
    .replace(/\x1b[78]/g, '')
}

/**
 * 从串尾拆出可能未闭合的转义前缀，避免分包时把 \x1b 与 [33m 拆开误当成可见字符
 * @param {string} s 文本字符串
 * @returns {{ body: string, carry: string }} 包含已去掉转义序列的文本和可能未闭合的转义前缀
 */
function peelIncompleteAnsiSuffix(s: string): { body: string; carry: string } {
  if (!s) return { body: '', carry: '' }
  let m: RegExpMatchArray | null
  if ((m = s.match(/\x1b\](?:[^\x07\x1b]|\x1b(?!\\))*$/))) {
    return { body: s.slice(0, -m[0].length), carry: m[0] }
  }
  if ((m = s.match(/\x1b\[[\x30-\x3f\x20-\x2f]*$/))) {
    return { body: s.slice(0, -m[0].length), carry: m[0] }
  }
  if (s.endsWith('\x1b')) {
    return { body: s.slice(0, -1), carry: '\x1b' }
  }
  if (s.endsWith('\u009b')) {
    return { body: s.slice(0, -1), carry: '\u009b' }
  }
  return { body: s, carry: '' }
}

/**
 * 去掉其余 C0 控制符（保留 \t \n \r）
 * @param {string} s 文本字符串
 * @returns {string} 去掉其余 C0 控制符（保留 \t \n \r）后的文本
 */
function stripOtherC0Controls(s: string): string {
  return s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
}

/**
 * 将一段终端输出转为适合写入 .log 的纯文本（可见字符 + 换行制表）
 * @param {string} carry 可能未闭合的转义前缀
 * @param {string} chunk 终端输出
 * @returns {{ text: string, carry: string }} 包含已去掉转义序列的文本和可能未闭合的转义前缀
 */
function stripAnsiForLogChunk(carry: string, chunk: string): { text: string; carry: string } {
  const raw = carry + chunk
  const { body, carry: nextCarry } = peelIncompleteAnsiSuffix(raw)
  const text = stripOtherC0Controls(stripCompleteAnsiEscapes(body))
  return { text, carry: nextCarry }
}

/**
 * 设置会话日志：buffer = xterm 缓冲快照整文件覆盖；stream = 下行流去 ANSI 后追加。
 * @param {Object} session 会话对象，包含连接信息和状态
 * @param {Object} settings 设置对象，包含用户偏好设置
 * @param {{ current: object | null }} logFileRef 日志引用，包含 setTerminal、scheduleSnapshot 和 enqueue 方法
 * @param {{ current: { sessionId: string|null, stem: string|null } }} logFileStemStateRef 日志文件名状态引用，包含 sessionId 和 stem
 * @param {{ current?: object } | null} _settingsRef 预留与调用方签名一致（本函数内以创建时的 logKind 为准）
 */
function setupLogging(
  session: ActiveSession,
  settings: AppSettings,
  logFileRef: MutableRefObject<SessionLogHandle | null>,
  logFileStemStateRef: MutableRefObject<{ sessionId: string | null; stem: string | null }>,
  _settingsRef: MutableRefObject<AppSettings>,
): void {
  if (normalizeLoggingMode(settings?.loggingMode) === 'none') return
  const logDir = resolveLoggingDirectory(settings)
  if (!logDir) return

  /** 本控制器创建时的写入方式（关闭日志时 settings 可能已变为 none，收尾刷盘仍按此方式执行） */
  const logKind = normalizeLoggingMode(settings.loggingMode)

  /** 同一标签页内复用的日志主文件名（不含 .log） */
  const stemState = logFileStemStateRef.current
  if (stemState.sessionId !== session.id) {
    stemState.sessionId = session.id
    stemState.stem = null
  }

  let logFileName = stemState.stem
  if (!logFileName) { // 如果日志文件名为空，则生成新的日志文件名
    const now = new Date()
    const timestamp = now.getFullYear() +
      String(now.getMonth()+1).padStart(2,'0') +
      String(now.getDate()).padStart(2,'0') + '_' +
      String(now.getHours()).padStart(2,'0') +
      String(now.getMinutes()).padStart(2,'0') +
      String(now.getSeconds()).padStart(2,'0')
    const sessionName = safeFileToken(session.label || session.host || session.path || session.id || 'session')
    logFileName = `${timestamp}_${sessionName}`
    stemState.stem = logFileName
  }

  // --- stream（追加）
  let pending = ''
  let ansiCarry = ''
  let streamTimer: number | null = null
  /** 刷新待处理流数据 */
  const flushPendingStream = () => {
    streamTimer = null
    if (!pending) return
    const chunk = pending
    pending = ''
    window.zterm?.log?.append?.(logDir, logFileName, chunk)
  }

  /** 将数据追加到日志文件中 */
  const enqueue = (chunk: string) => {
    if (logKind !== 'stream') return
    if (chunk === '' || chunk == null) return
    if (typeof chunk !== 'string') return
    if (!window.zterm?.log?.append) return
    const { text, carry } = stripAnsiForLogChunk(ansiCarry, chunk)
    ansiCarry = carry
    if (!text) return
    pending += text
    if (streamTimer != null) return
    streamTimer = window.setTimeout(flushPendingStream, 80)
  }

  // --- buffer（整文件覆盖）
  /** xterm 终端实例 */
  let terminal: Terminal | null = null
  /** 定时器引用，用于延迟执行快照 */
  let snapshotTimer: number | null = null
  /** 快照延迟时间 */
  const SNAPSHOT_DEBOUNCE_MS = 80
  /** 刷新快照 */
  const flushSnapshot = () => {
    if (!window.zterm?.log?.write) return
    if (!terminal) return
    try {
      window.zterm.log.write(logDir, logFileName, exportTerminalBuffer(terminal))
    } catch (_) {}
  }

  /** 计划快照 */
  const scheduleSnapshot = () => {
    if (logKind !== 'buffer') return
    if (!window.zterm?.log?.write) return
    if (!terminal) return
    if (snapshotTimer != null) {
      window.clearTimeout(snapshotTimer)
      snapshotTimer = null
    }
    snapshotTimer = window.setTimeout(() => {
      snapshotTimer = null
      flushSnapshot()
    }, SNAPSHOT_DEBOUNCE_MS)
  }

  /** 立即刷盘 */
  const flushNow = () => {
    if (snapshotTimer != null) {
      window.clearTimeout(snapshotTimer)
      snapshotTimer = null
    }
    if (streamTimer != null) {
      window.clearTimeout(streamTimer)
      streamTimer = null
    }
    if (logKind === 'buffer') {
      pending = ''
      ansiCarry = ''
      flushSnapshot()
    } else {
      if (ansiCarry) {
        const { text } = stripAnsiForLogChunk(ansiCarry, '')
        ansiCarry = ''
        if (text) pending += text
      }
      flushPendingStream()
    }
  }

  const setTerminal = (t: Terminal | null) => {
    terminal = t
  }

  logFileRef.current = { setTerminal, scheduleSnapshot, enqueue, flushNow }
}

/**
 * 连接会话：根据会话类型（SSH/Telnet/Serial）调用对应的连接函数，设置数据接收和连接关闭的处理函数，并将清理函数添加到 cleanupRef 以便组件卸载时调用
 * @param {Terminal} term xterm 终端实例
 * @param {FitAddon} fitAddon FitAddon 实例，用于调整终端尺寸
 * @param {Object} session 会话对象，包含连接信息和状态
 * @param {Function} onUpdate 会话状态更新回调函数
 * @param {Object} cleanupRef 清理函数引用，用于存储连接相关的清理函数
 * @param {Object} disconnectedRef 断连状态引用，用于标记当前连接是否已断开
 * @param {Function} isCancelled 可选的取消函数，组件卸载时返回 true，连接过程中定期调用以判断是否应放弃后续操作
 * @param {{ current: { setTerminal?: (t: import('@xterm/xterm').Terminal) => void, scheduleSnapshot?: () => void, enqueue?: (chunk: string) => void, flushNow?: () => void } | null }} logFileRef 会话日志：buffer / stream 由设置决定，flushNow 立即刷盘
 * @param {Object} settingsRef 设置引用，用于读取实时终端行为设置
 */
async function connectSession(
  term: Terminal,
  fitAddon: FitAddon,
  session: ActiveSession,
  onUpdate: (updates: Partial<ActiveSession>) => void,
  cleanupRef: MutableRefObject<Array<() => void>>,
  disconnectedRef: MutableRefObject<boolean>,
  isCancelled: () => boolean,
  logFileRef: MutableRefObject<SessionLogHandle | null>,
  settingsRef: MutableRefObject<AppSettings>,
): Promise<void> {
  const { id, type } = session
  const terminalEncoding = sessionTerminalEncoding(session)
  const L = () => resolveEffectiveUiLanguage(settingsRef.current?.uiLanguage)
  const writeInfo = (m: string) => writelnWithLog(term, logFileRef, `\r\x1b[33m${m}\x1b[0m`)
  const writeError = (m: string) => writelnWithLog(term, logFileRef, `\r\x1b[31m${m}\x1b[0m`)
  const writeSuccess = (m: string) => writelnWithLog(term, logFileRef, `\r\x1b[32m${m}\x1b[0m`)
  // errorKnown:false 直出原文; true 则按 error 路径走 i18n
  const terminalErr = (e: unknown) => formatThrownIpcError((p, params) => translateRender(L(), p, params), e)

  /**
   * 连接断开处理函数：在终端显示断开消息，提示用户按 R 重连，更新会话状态为断开，并设置断连标记
   * @param {string} msgKey terminal.* 文案键
   */
  const onDisconnect = (msgKey: string) => {
    writeInfo(`\r\n${translateRender(L(), msgKey)}`)
    writeInfo(`\x1b[2m${translateRender(L(), 'terminal.pressR')}\x1b[0m`)
    disconnectedRef.current = true
    onUpdate({ status: 'disconnected', sftpReady: false })
  }

  // 串口下行小块聚合：高亮规则需在足够长的文本上匹配，UART 常逐字节到达
  let serialHighlightBuf = ''
  let serialHighlightIdleTimer: number | null = null
  /** 串口高亮缓冲区空闲时刷新：避免长时间无数据时高亮规则无法匹配 */
  const flushSerialHighlightIdle = () => {
    serialHighlightIdleTimer = null
    if (!serialHighlightBuf) return
    const chunk = serialHighlightBuf
    serialHighlightBuf = ''
    const highlighted = applyHighlightRules(chunk, settingsRef.current)
    term.write(highlighted)
    logFileRef.current?.scheduleSnapshot?.()
    logFileRef.current?.enqueue?.(highlighted)
  }
  /** 计划串口高亮缓冲区空闲时刷新：避免长时间无数据时高亮规则无法匹配 */
  const scheduleSerialHighlightFlush = () => {
    if (serialHighlightIdleTimer != null) clearTimeout(serialHighlightIdleTimer)
    serialHighlightIdleTimer = window.setTimeout(flushSerialHighlightIdle, 32)
  }

  /**
   * 数据接收处理函数：将接收到的二进制数据转换为 UTF-8 字符串，写入终端并记录日志
   * @param {string} data 接收到的二进制数据字符串
   */
  const recv = (data: string) => {
    const decoded = decodeIncomingTerminalWire(data, terminalEncoding)
    if (type !== 'serial') { // 非串口：直接应用高亮规则
      const highlighted = applyHighlightRules(decoded, settingsRef.current)
      term.write(highlighted)
      logFileRef.current?.scheduleSnapshot?.()
      logFileRef.current?.enqueue?.(highlighted)
      return
    }
    serialHighlightBuf += decoded
    let end
    while ((end = nextLineBreakEndIndex(serialHighlightBuf)) >= 0) { // 串口：按行切分并应用高亮规则
      const line = serialHighlightBuf.slice(0, end + 1)
      serialHighlightBuf = serialHighlightBuf.slice(end + 1)
      const highlighted = applyHighlightRules(line, settingsRef.current)
      term.write(highlighted)
      logFileRef.current?.scheduleSnapshot?.()
      logFileRef.current?.enqueue?.(highlighted)
    }
    if (serialHighlightBuf.length > 8192) { // 串口：缓冲区溢出：截断并应用高亮规则
      const overflow = serialHighlightBuf
      serialHighlightBuf = ''
      const highlighted = applyHighlightRules(overflow, settingsRef.current)
      term.write(highlighted)
      logFileRef.current?.scheduleSnapshot?.()
      logFileRef.current?.enqueue?.(highlighted)
    }
    if (serialHighlightBuf.length === 0) { // 串口：缓冲区空：清除定时器
      if (serialHighlightIdleTimer != null) {
        clearTimeout(serialHighlightIdleTimer)
        serialHighlightIdleTimer = null
      }
    } else { // 串口：缓冲区非空：计划高亮缓冲区空闲时刷新
      scheduleSerialHighlightFlush()
    }
  }

  if (type === 'ssh') {
    writeInfo(translateRender(L(), 'terminal.sshConnecting', { host: session.host ?? '', port: session.port ?? 22 }))
    try {
      const zterm = getZterm()
      const connectPayload: Record<string, unknown> = {
        ...session,
        algorithms: settingsRef.current?.algorithmPreferences,
      }
      const res = await zterm.ssh.connect(id, connectPayload)
      if (isCancelled?.()) return   // 组件已卸载，放弃后续注册
      assertIpcSuccess(res)
      writeSuccess(translateRender(L(), 'terminal.connected'))
      onUpdate({ status: 'connected' })
      const dim = fitAddon.proposeDimensions() || { cols: 80, rows: 24 }  // 获取终端建议尺寸（列和行），默认80x24
      zterm.ssh.resize(id, dim.cols, dim.rows)

      const r1 = zterm.ssh.onData(id, recv)  // 注册 SSH 数据接收事件监听器，使用 recv 函数处理数据
      const r2 = zterm.ssh.onClose(id, () => onDisconnect('terminal.closed'))  // 注册 SSH 关闭事件监听器，调用 onDisconnect 处理断开
      const d1 = term.onData((data) => {  // 注册终端数据事件监听器，用户输入时发送到 SSH（回显由对端数据经 recv 记入日志，避免与本地按键重复）
        zterm.ssh.sendData(id, normalizeInputData(type, data, session), terminalEncoding)
      })
      const d2 = term.onResize(({ cols, rows }) => zterm.ssh.resize(id, cols, rows))  // 注册终端尺寸变化事件监听器，调整 SSH 连接尺寸
      cleanupRef.current.push(r1, r2, () => d1.dispose(), () => d2.dispose(), () => zterm.ssh.disconnect(id))  // 将所有清理函数添加到 cleanupRef 列表，包括移除监听器和断开连接

      if (session.enableSftp) {  // 如果会话配置启用 SFTP，则尝试连接 SFTP，并在连接成功后更新会话状态以显示 SFTP 功能
        try {
          const sftpPayload: Record<string, unknown> = {
            ...session,
            algorithms: settingsRef.current?.algorithmPreferences,
          }
          const sr = await zterm.sftp.connect(id + '-sftp', sftpPayload)
          if (isCancelled?.()) return
          if (sr.success) {
            onUpdate({ status: 'connected', sftpReady: true })
            cleanupRef.current.push(() => zterm.sftp.disconnect(id + '-sftp'))
          } else {
            assertIpcSuccess(sr)
          }
        } catch (e) { 
          writeError(terminalErr(e))
          zterm.ssh.sendData(id, '\n', terminalEncoding)
          onUpdate({ sftpReady: false })
        }
      }
    } catch (e) {
      if (isCancelled?.()) return
      writeError(terminalErr(e))
      onUpdate({ status: 'error' })
    }

  } else if (type === 'telnet') {
    writeInfo(translateRender(L(), 'terminal.telnetConnecting', { host: session.host ?? '', port: session.port ?? 23 }))
    try {
      const zterm = getZterm()
      const res = await zterm.telnet.connect(id, session as unknown as Record<string, unknown>)
      if (isCancelled?.()) return
      assertIpcSuccess(res)
      writeSuccess(translateRender(L(), 'terminal.connected'))
      onUpdate({ status: 'connected' })
      const r1 = zterm.telnet.onData(id, recv)
      const r2 = zterm.telnet.onClose(id, () => onDisconnect('terminal.closed'))
      const d1 = term.onData((data) => {
        zterm.telnet.sendData(id, normalizeInputData(type, data, session), terminalEncoding)
      })
      cleanupRef.current.push(r1, r2, () => d1.dispose(), () => zterm.telnet.disconnect(id))
    } catch (e) {
      if (isCancelled?.()) return
      writeError(terminalErr(e))
      onUpdate({ status: 'error' })
    }

  } else if (type === 'serial') {
    writeInfo(translateRender(L(), 'terminal.serialOpening', { path: session.path ?? '', baud: session.baudRate ?? 9600 }))
    try {
      const zterm = getZterm()
      const res = await zterm.serial.connect(id, session as unknown as Record<string, unknown>)
      if (isCancelled?.()) return
      assertIpcSuccess(res)
      writeSuccess(translateRender(L(), 'terminal.serialOpened'))
      onUpdate({ status: 'connected' })
      const r1 = zterm.serial.onData(id, recv)
      const r2 = zterm.serial.onClose(id, () => onDisconnect('terminal.portClosed'))
      const d1 = term.onData((data) => {
        zterm.serial.sendData(id, normalizeInputData(type, data, session), terminalEncoding)
      })
      cleanupRef.current.push(() => { // 清理：清除定时器，退出前刷出串口尾块（与 recv 一致记入日志）
        if (serialHighlightIdleTimer != null) {
          clearTimeout(serialHighlightIdleTimer)
          serialHighlightIdleTimer = null
        }
        if (serialHighlightBuf) {
          const highlighted = applyHighlightRules(serialHighlightBuf, settingsRef.current)
          term.write(highlighted)
          logFileRef.current?.scheduleSnapshot?.()
          logFileRef.current?.enqueue?.(highlighted)
          serialHighlightBuf = ''
        }
      }, r1, r2, () => d1.dispose(), () => zterm.serial.disconnect(id))
    } catch (e) {
      if (isCancelled?.()) return
      writeError(terminalErr(e))
      onUpdate({ status: 'error' })
    }
  }
}
