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
  const settingsRef = useRef<AppSettings>(settings)
  useEffect(() => { settingsRef.current = settings }, [settings])

  useEffect(() => {
    if (!containerRef.current) return
    const { term, fitAddon, disposeSettings } = mountTerminal(
      containerRef.current,
      appThemeEffective,
      settingsRef,
    )
    termRef.current = term
    fitAddonRef.current = fitAddon

    let cancelled = false
    connectSession(term, fitAddon, session, onUpdate, cleanupRef, disconnectedRef, () => cancelled, logFileRef, settingsRef)

    const logOnResize = term.onResize(() => {
      if (normalizeLoggingMode(settingsRef.current?.loggingMode) === 'buffer') {
        logFileRef.current?.scheduleSnapshot?.()
      }
    })
    cleanupRef.current.push(() => { try { logOnResize.dispose() } catch {} }, disposeSettings)

    const ro = new ResizeObserver(() => { try { fitAddon.fit() } catch {} })
    ro.observe(containerRef.current)
    cleanupRef.current.push(() => ro.disconnect())

    return () => {
      cancelled = true
      cleanupRef.current.forEach(fn => { try { fn() } catch {} })
      cleanupRef.current = []
      try { logFileRef.current?.flushNow?.() } catch {}
      logFileRef.current = null
      term.dispose()
    }
  }, [session.id])

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

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    const sb = clampTerminalScrollback(settings?.terminalScrollback)
    if (term.options.scrollback !== sb) {
      term.options.scrollback = sb
    }
  }, [settings?.terminalScrollback])

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = getXtermTheme(appThemeEffective)
    try {
      term.refresh(0, term.rows - 1)
    } catch {}
  }, [appThemeEffective])

  useEffect(() => {
    if (active && fitAddonRef.current) {
      setTimeout(() => { try { fitAddonRef.current?.fit() } catch {} ; termRef.current?.focus() }, 50)
    }
  }, [active])

  useEffect(() => {
    const getter = () => exportTerminalBuffer(termRef.current)
    onRegisterExport?.(session.id, getter)
    return () => onRegisterExport?.(session.id, null)
  }, [session.id, onRegisterExport])

  useEffect(() => {
    const clear = () => {
      const term = termRef.current
      if (!term) return
      try { term.clear() } catch {}
      logFileRef.current?.scheduleSnapshot?.()
    }
    onRegisterClearScreen?.(session.id, clear)
    return () => onRegisterClearScreen?.(session.id, null)
  }, [session.id, onRegisterClearScreen])

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    const d = term.onKey(({ key }) => {
      if (disconnectedRef.current && (key === 'r' || key === 'R')) {
        disconnectedRef.current = false
        cleanupRef.current.forEach(fn => { try { fn() } catch {} })
        cleanupRef.current = []
        try { logFileRef.current?.flushNow?.() } catch {}
        const container = containerRef.current
        const fitAddon = fitAddonRef.current
        if (!container || !fitAddon) return
        const ro = new ResizeObserver(() => { try { fitAddonRef.current?.fit() } catch {} })
        ro.observe(container)
        cleanupRef.current.push(() => ro.disconnect())
        setupLogging(session, settingsRef.current, logFileRef, logFileStemStateRef, settingsRef)
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

export default memo(TerminalPanel)
