import type { MutableRefObject } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import {
  decodeIncomingTerminalWire,
  sessionTerminalEncoding,
} from '../terminalEncodingService'
import { clampTerminalScrollback } from '../settings/normalize'
import { translateRender } from '../../i18n/translateRender'
import { resolveEffectiveUiLanguage } from '../resolveUiLanguage'
import { assertIpcSuccess } from '../ipc/ipcError'
import { getZterm } from '@/lib/ipc/getZterm'
import { formatThrownIpcError } from '@/lib/ipc/formatIpcError'
import { getXtermTheme } from '../../theme/appTheme'
import {
  pickSerialConnectConfig,
  pickSshConnectConfig,
  pickTelnetConnectConfig,
} from '../session/connectPayload'
import { applyHighlightRules, nextLineBreakEndIndex } from './terminalHighlight'
import { exportTerminalBuffer, setupLogging } from './terminalLogging'
import type { ActiveSession, SessionType } from '../../types/session'
import type { AppSettings } from '../../types/settings'
import type { SessionLogHandle } from '../../types/terminal'

export function writelnWithLog(
  term: Terminal,
  logRef: MutableRefObject<SessionLogHandle | null>,
  lineForWriteln: string,
): void {
  term.writeln(lineForWriteln)
  logRef.current?.scheduleSnapshot?.()
  logRef.current?.enqueue?.(lineForWriteln + '\r\n')
}

function normalizeInputData(type: SessionType | string, data: string, session: ActiveSession): string {
  const mode = String(session?.backspaceMode || 'auto').toLowerCase()
  if (mode === 'del') return data.replace(/\x08/g, '\x7f')
  if (mode === 'bs') return data.replace(/\x7f/g, '\x08')
  if (type === 'telnet' || type === 'serial') return data.replace(/\x7f/g, '\x08')
  return data
}

export function createTerminal(themeMode: 'dark' | 'light', scrollback: number): Terminal {
  return new Terminal({
    fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Menlo, monospace',
    fontSize: 14,
    lineHeight: 1.4,
    cursorBlink: true,
    cursorStyle: 'bar',
    allowTransparency: true,
    scrollback,
    windowsMode: false,
    theme: getXtermTheme(themeMode),
  })
}

/** 应用终端交互设置，返回清理函数 */
export function applyTerminalSettings(
  term: Terminal,
  settingsRef: MutableRefObject<AppSettings>,
): () => void {
  const selDispose = term.onSelectionChange(() => {
    const interact = settingsRef.current?.terminalInteract ?? true
    if (!interact) return
    const sel = term.getSelection()
    if (sel && sel.length > 0) {
      navigator.clipboard?.writeText(sel).catch(() => {})
    }
  })

  let ctxTimer: number | null = null
  let ctxEl: HTMLElement | null = null
  let ctxHandler: ((e: MouseEvent) => void) | null = null

  const addCtx = () => {
    if (!term.element) {
      ctxTimer = window.setTimeout(addCtx, 50)
      return
    }
    ctxEl = term.element
    ctxHandler = async (e: MouseEvent) => {
      const interact = settingsRef.current?.terminalInteract ?? true
      if (!interact) return
      e.preventDefault()
      try {
        const t = await navigator.clipboard.readText()
        term.paste(t)
      } catch {}
    }
    ctxEl.addEventListener('contextmenu', ctxHandler)
  }
  addCtx()

  return () => {
    selDispose.dispose()
    if (ctxTimer != null) window.clearTimeout(ctxTimer)
    if (ctxEl && ctxHandler) ctxEl.removeEventListener('contextmenu', ctxHandler)
  }
}

export async function connectSession(
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
  const terminalErr = (e: unknown) => formatThrownIpcError((p, params) => translateRender(L(), p, params), e)

  const onDisconnect = (msgKey: string) => {
    writeInfo(`\r\n${translateRender(L(), msgKey)}`)
    writeInfo(`\x1b[2m${translateRender(L(), 'terminal.pressR')}\x1b[0m`)
    disconnectedRef.current = true
    onUpdate({ status: 'disconnected', sftpReady: false })
  }

  let serialHighlightBuf = ''
  let serialHighlightIdleTimer: number | null = null
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
  const scheduleSerialHighlightFlush = () => {
    if (serialHighlightIdleTimer != null) clearTimeout(serialHighlightIdleTimer)
    serialHighlightIdleTimer = window.setTimeout(flushSerialHighlightIdle, 32)
  }

  const recv = (data: string) => {
    const decoded = decodeIncomingTerminalWire(data, terminalEncoding)
    if (type !== 'serial') {
      const highlighted = applyHighlightRules(decoded, settingsRef.current)
      term.write(highlighted)
      logFileRef.current?.scheduleSnapshot?.()
      logFileRef.current?.enqueue?.(highlighted)
      return
    }
    serialHighlightBuf += decoded
    let end
    while ((end = nextLineBreakEndIndex(serialHighlightBuf)) >= 0) {
      const line = serialHighlightBuf.slice(0, end + 1)
      serialHighlightBuf = serialHighlightBuf.slice(end + 1)
      const highlighted = applyHighlightRules(line, settingsRef.current)
      term.write(highlighted)
      logFileRef.current?.scheduleSnapshot?.()
      logFileRef.current?.enqueue?.(highlighted)
    }
    if (serialHighlightBuf.length > 8192) {
      const overflow = serialHighlightBuf
      serialHighlightBuf = ''
      const highlighted = applyHighlightRules(overflow, settingsRef.current)
      term.write(highlighted)
      logFileRef.current?.scheduleSnapshot?.()
      logFileRef.current?.enqueue?.(highlighted)
    }
    if (serialHighlightBuf.length === 0) {
      if (serialHighlightIdleTimer != null) {
        clearTimeout(serialHighlightIdleTimer)
        serialHighlightIdleTimer = null
      }
    } else {
      scheduleSerialHighlightFlush()
    }
  }

  if (type === 'ssh') {
    writeInfo(translateRender(L(), 'terminal.sshConnecting', { host: session.host ?? '', port: session.port ?? 22 }))
    try {
      const zterm = getZterm()
      const connectPayload = pickSshConnectConfig(session, settingsRef.current?.algorithmPreferences)
      const res = await zterm.ssh.connect(id, connectPayload)
      if (isCancelled?.()) return
      assertIpcSuccess(res)
      writeSuccess(translateRender(L(), 'terminal.connected'))
      onUpdate({ status: 'connected' })
      const dim = fitAddon.proposeDimensions() || { cols: 80, rows: 24 }
      zterm.ssh.resize(id, dim.cols, dim.rows)

      const r1 = zterm.ssh.onData(id, recv)
      const r2 = zterm.ssh.onClose(id, () => onDisconnect('terminal.closed'))
      const d1 = term.onData((data) => {
        zterm.ssh.sendData(id, normalizeInputData(type, data, session), terminalEncoding)
      })
      const d2 = term.onResize(({ cols, rows }) => zterm.ssh.resize(id, cols, rows))
      cleanupRef.current.push(r1, r2, () => d1.dispose(), () => d2.dispose(), () => zterm.ssh.disconnect(id))

      if (session.enableSftp) {
        try {
          const sftpPayload = pickSshConnectConfig(session, settingsRef.current?.algorithmPreferences)
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
      const res = await zterm.telnet.connect(id, pickTelnetConnectConfig(session))
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
      const res = await zterm.serial.connect(id, pickSerialConnectConfig(session))
      if (isCancelled?.()) return
      assertIpcSuccess(res)
      writeSuccess(translateRender(L(), 'terminal.serialOpened'))
      onUpdate({ status: 'connected' })
      const r1 = zterm.serial.onData(id, recv)
      const r2 = zterm.serial.onClose(id, () => onDisconnect('terminal.portClosed'))
      const d1 = term.onData((data) => {
        zterm.serial.sendData(id, normalizeInputData(type, data, session), terminalEncoding)
      })
      cleanupRef.current.push(() => {
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

export function mountTerminal(
  container: HTMLDivElement,
  appThemeEffective: 'dark' | 'light',
  settingsRef: MutableRefObject<AppSettings>,
): { term: Terminal; fitAddon: FitAddon; disposeSettings: () => void } {
  const term = createTerminal(appThemeEffective, clampTerminalScrollback(settingsRef.current?.terminalScrollback))
  const fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(new WebLinksAddon())
  term.open(container)
  fitAddon.fit()
  const disposeSettings = applyTerminalSettings(term, settingsRef)
  return { term, fitAddon, disposeSettings }
}

export { exportTerminalBuffer, setupLogging }
