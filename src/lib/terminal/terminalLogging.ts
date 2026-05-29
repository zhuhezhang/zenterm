import type { Terminal } from '@xterm/xterm'
import type { MutableRefObject } from 'react'
import { safeFileToken } from '../safeFileName'
import { fileTimestamp } from '../util/fileTimestamp'
import { resolveLoggingDirectory } from '../../store/settingsStore'
import { normalizeLoggingMode } from '../settings/normalize'
import type { ActiveSession } from '../../types/session'
import type { AppSettings } from '../../types/settings'
import type { SessionLogHandle } from '../../types/terminal'

export function exportTerminalBuffer(term: Terminal | null): string {
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

function peelIncompleteAnsiSuffix(s: string): { body: string; carry: string } {
  if (!s) return { body: '', carry: '' }
  let m: RegExpMatchArray | null
  if ((m = s.match(/\x1b\](?:[^\x07\x1b]|\x1b(?!\\))*$/))) {
    return { body: s.slice(0, -m[0].length), carry: m[0] }
  }
  if ((m = s.match(/\x1b\[[\x30-\x3f\x20-\x2f]*$/))) {
    return { body: s.slice(0, -m[0].length), carry: m[0] }
  }
  if (s.endsWith('\x1b')) return { body: s.slice(0, -1), carry: '\x1b' }
  if (s.endsWith('\u009b')) return { body: s.slice(0, -1), carry: '\u009b' }
  return { body: s, carry: '' }
}

function stripOtherC0Controls(s: string): string {
  return s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
}

function stripAnsiForLogChunk(carry: string, chunk: string): { text: string; carry: string } {
  const raw = carry + chunk
  const { body, carry: nextCarry } = peelIncompleteAnsiSuffix(raw)
  const text = stripOtherC0Controls(stripCompleteAnsiEscapes(body))
  return { text, carry: nextCarry }
}

/** 设置会话日志控制器 */
export function setupLogging(
  session: ActiveSession,
  settings: AppSettings,
  logFileRef: MutableRefObject<SessionLogHandle | null>,
  logFileStemStateRef: MutableRefObject<{ sessionId: string | null; stem: string | null }>,
  _settingsRef: MutableRefObject<AppSettings>,
): void {
  if (normalizeLoggingMode(settings?.loggingMode) === 'none') return
  const logDir = resolveLoggingDirectory(settings)
  if (!logDir) return

  const logKind = normalizeLoggingMode(settings.loggingMode)
  const stemState = logFileStemStateRef.current
  if (stemState.sessionId !== session.id) {
    stemState.sessionId = session.id
    stemState.stem = null
  }

  let logFileName = stemState.stem
  if (!logFileName) {
    const sessionName = safeFileToken(session.label || session.host || session.path || session.id || 'session')
    logFileName = `${fileTimestamp()}_${sessionName}`
    stemState.stem = logFileName
  }

  let pending = ''
  let ansiCarry = ''
  let streamTimer: number | null = null
  const flushPendingStream = () => {
    streamTimer = null
    if (!pending) return
    const chunk = pending
    pending = ''
    window.zterm?.log?.append?.(logDir, logFileName, chunk)
  }

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

  let terminal: Terminal | null = null
  let snapshotTimer: number | null = null
  const SNAPSHOT_DEBOUNCE_MS = 80
  const flushSnapshot = () => {
    if (!window.zterm?.log?.write) return
    if (!terminal) return
    try {
      window.zterm.log.write(logDir, logFileName, exportTerminalBuffer(terminal))
    } catch {}
  }

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
