import { useEffect, useRef, memo } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { clampTerminalScrollback, normalizeLoggingMode } from '../lib/settings/normalize'
import { translateRender } from '../i18n/translateRender'
import { resolveEffectiveUiLanguage } from '../lib/resolveUiLanguage'
import { getXtermTheme } from '../theme/appTheme'
import {
  connectSession,
  exportTerminalBuffer,
  mountTerminal,
  setupLogging,
  writelnWithLog,
} from '../lib/terminal/terminalSession'
import '@xterm/xterm/css/xterm.css'
import type { TerminalPanelProps } from '../types/components'
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
function TerminalPanel({
  session,
  active,
  onUpdate,
  settings,
  appThemeEffective = 'dark',
  onRegisterExport,
  onRegisterClearScreen,
}: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<import('@xterm/xterm').Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const cleanupRef = useRef<Array<() => void>>([])
  const logFileRef = useRef<SessionLogHandle | null>(null)
  const logFileStemStateRef = useRef<{ sessionId: string | null; stem: string | null }>({
    sessionId: null,
    stem: null,
  })
  const disconnectedRef = useRef(false)
  const sessionRef = useRef(session)
  const settingsRef = useRef<AppSettings>(settings)
  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => { settingsRef.current = settings }, [settings])

  useEffect(() => {  // 组件初次挂载时：创建终端实例、连接会话，并设置相关事件监听器；组件卸载时：调用 cleanupRef 中的函数进行清理
    if (!containerRef.current) return
    const { term, fitAddon, disposeSettings } = mountTerminal(
      containerRef.current,
      appThemeEffective,
      settingsRef,
    )
    termRef.current = term
    fitAddonRef.current = fitAddon

    let cancelled = false
    connectSession(term, fitAddon, session, sessionRef, onUpdate, cleanupRef, disconnectedRef, () => cancelled, logFileRef, settingsRef)

    const logOnResize = term.onResize(() => {
      if (normalizeLoggingMode(settingsRef.current?.loggingMode) === 'buffer') {
        logFileRef.current?.scheduleSnapshot?.()
      }
    })
    cleanupRef.current.push(() => { try { logOnResize.dispose() } catch {} }, disposeSettings)

    const ro = new ResizeObserver(() => { try { fitAddon.fit() } catch {} })  // 监听容器尺寸变化，调整终端尺寸以适应新的容器大小
    ro.observe(containerRef.current)
    cleanupRef.current.push(() => ro.disconnect())  // 将 ResizeObserver 的断开函数添加到 cleanupRef 中，以便组件卸载时调用来停止监听尺寸变化

    return () => {  // 清理：卸载时取消连接、清理监听器、刷盘会话日志、销毁终端
      cancelled = true
      cleanupRef.current.forEach(fn => { try { fn() } catch {} })
      cleanupRef.current = []
      try { logFileRef.current?.flushNow?.() } catch {}
      logFileRef.current = null
      term.dispose()
    }
  }, [session.id])

  /** 日志：写入方式或目录变化时重建控制器并绑定当前终端 */
  useEffect(() => {
    const term = termRef.current
    if (normalizeLoggingMode(settings.loggingMode) === 'none') {
      try { logFileRef.current?.flushNow?.() } catch {}
      logFileRef.current = null
      return
    }
    try { logFileRef.current?.flushNow?.() } catch {}
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
    } catch {}
  }, [appThemeEffective])

  useEffect(() => {  // 当 active 状态变化时，如果当前标签页变为活跃，则调整终端尺寸并聚焦终端，确保用户界面正确显示并且用户可以立即输入
    if (active && fitAddonRef.current) {
      setTimeout(() => { try { fitAddonRef.current?.fit() } catch {} ; termRef.current?.focus() }, 50)
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
      } catch {}
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
        cleanupRef.current.forEach(fn => { try { fn() } catch {} })  // 调用 cleanupRef 中的函数清理之前的连接状态和事件监听器，确保重连时不会有遗留的状态或监听器干扰新的连接
        cleanupRef.current = []
        try { logFileRef.current?.flushNow?.() } catch {}  // 先刷盘，再换日志控制器
        const container = containerRef.current
        const fitAddon = fitAddonRef.current
        if (!container || !fitAddon) return
        const ro = new ResizeObserver(() => { try { fitAddonRef.current?.fit() } catch {} })  // 重连时要重新监听容器尺寸变化
        ro.observe(container)
        cleanupRef.current.push(() => ro.disconnect())
        setupLogging(session, settingsRef.current, logFileRef, logFileStemStateRef, settingsRef)  // 重连：复用本标签页首次连接时的日志文件
        logFileRef.current?.setTerminal?.(term)
        writelnWithLog(term, logFileRef, `\r\x1b[33m${translateRender(resolveEffectiveUiLanguage(settings?.uiLanguage), 'terminal.reconnecting')}\x1b[0m`)
        connectSession(term, fitAddon, sessionRef.current, sessionRef, onUpdate, cleanupRef, disconnectedRef, () => false, logFileRef, settingsRef)
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

export default memo(TerminalPanel)
