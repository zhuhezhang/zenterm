import type { NormalizeImportedSessionResult, SessionImportWarning } from '../../types/import'
import type {
  RawImportedSession,
  SavedSession,
  SerialSavedSession,
  SessionType,
  SshSavedSession,
  SessionFormValues,
  TelnetSavedSession,
} from '../../types/session'
import { TERMINAL_ENCODING_OPTIONS, normalizeTerminalEncoding } from '../terminalEncodingService'
import {
  getSessionStorageDefaults,
  SESSION_TYPE_SET,
  AUTH_TYPE_SET,
  BAUD_RATE_SET,
  PARITY_SET,
  PORT_MIN,
  PORT_MAX,
} from './defaults'
import type { SerialStorageDefaults, SshStorageDefaults } from './defaults'
import { pushSessionImportWarning } from './importWarnings'
import {
  normalizeBackspaceMode,
  clampSessionPort,
  buildSessionLabel,
  validateSessionGroupLabel,
  pickSessionStorageFields,
  applySerialStorageFields,
} from './utils'

/** 允许的终端编码的值集合 */
const ALLOWED_TERMINAL_ENCODINGS = new Set(TERMINAL_ENCODING_OPTIONS.map((o) => o.value))

function isPlainObject(raw: unknown): raw is RawImportedSession {
  return raw != null && typeof raw === 'object' && !Array.isArray(raw)
}

function resolveImportedEncoding(
  raw: RawImportedSession,
  fallback: string,
  warnings: SessionImportWarning[],
): string {
  const baseEnc = normalizeTerminalEncoding(fallback)
  if (raw.encoding === undefined) {
    return baseEnc
  }
  if (typeof raw.encoding !== 'string' || !raw.encoding.trim()) {
    pushSessionImportWarning(warnings, 'fieldDefaulted', {
      field: 'encoding',
      value: String(raw.encoding ?? ''),
      result: baseEnc,
    })
    return baseEnc
  }
  const norm = normalizeTerminalEncoding(raw.encoding)
  if (!ALLOWED_TERMINAL_ENCODINGS.has(norm)) {
    pushSessionImportWarning(warnings, 'fieldDefaulted', {
      field: 'encoding',
      value: raw.encoding,
      result: baseEnc,
    })
    return baseEnc
  }
  return norm
}

function applySerialStorageFieldsWithWarnings(
  merged: Partial<SerialSavedSession>,
  item: RawImportedSession,
  base: SerialStorageDefaults,
  warnings: SessionImportWarning[],
): void {
  merged.path = String(item.path).trim()

  if ('baudRate' in item && item.baudRate !== undefined) {
    const baud = parseInt(String(item.baudRate), 10)
    if (!Number.isFinite(baud) || !BAUD_RATE_SET.has(String(baud))) {
      pushSessionImportWarning(warnings, 'fieldDefaulted', {
        field: 'baudRate',
        value: String(item.baudRate),
        result: String(base.baudRate ?? ''),
      })
      merged.baudRate = base.baudRate
    } else {
      merged.baudRate = baud
    }
  } else {
    merged.baudRate = base.baudRate
  }

  if ('dataBits' in item && item.dataBits !== undefined) {
    const dataBits = parseInt(String(item.dataBits), 10)
    if (!Number.isFinite(dataBits)) {
      pushSessionImportWarning(warnings, 'fieldDefaulted', {
        field: 'dataBits',
        value: String(item.dataBits),
        result: String(base.dataBits ?? ''),
      })
      merged.dataBits = base.dataBits
    } else {
      merged.dataBits = dataBits
    }
  } else {
    merged.dataBits = base.dataBits
  }

  if ('stopBits' in item && item.stopBits !== undefined) {
    const stopBits = parseInt(String(item.stopBits), 10)
    if (!Number.isFinite(stopBits)) {
      pushSessionImportWarning(warnings, 'fieldDefaulted', {
        field: 'stopBits',
        value: String(item.stopBits),
        result: String(base.stopBits ?? ''),
      })
      merged.stopBits = base.stopBits
    } else {
      merged.stopBits = stopBits
    }
  } else {
    merged.stopBits = base.stopBits
  }

  if ('parity' in item && item.parity !== undefined) {
    const parity = String(item.parity).toLowerCase()
    if (!PARITY_SET.has(parity)) {
      pushSessionImportWarning(warnings, 'fieldDefaulted', {
        field: 'parity',
        value: String(item.parity),
        result: String(base.parity ?? ''),
      })
      merged.parity = base.parity
    } else {
      merged.parity = parity
    }
  } else {
    merged.parity = base.parity
  }
}

/**
 * 将导入的原始会话规范为可保存结构（逻辑对齐 ConnectDialog.buildConfig + 保存会话）
 */
export function normalizeImportedSession(raw: unknown): NormalizeImportedSessionResult {
  const warnings: SessionImportWarning[] = []

  if (!isPlainObject(raw)) {
    return { ok: false, reason: 'notObject' }
  }
  const item = raw
  const type = String(item.type ?? '').trim().toLowerCase() as SessionType
  if (!SESSION_TYPE_SET.has(type)) return { ok: false, reason: 'invalidType' }

  if (type === 'ssh' || type === 'telnet') {
    if (!String(item.host ?? '').trim()) return { ok: false, reason: 'missingHost' }
  }
  if (type === 'serial') {
    if (!String(item.path ?? '').trim()) return { ok: false, reason: 'missingPath' }
  }

  const group = String(item.group ?? '').trim()
  const labelInput = String(item.label ?? '').trim()
  const glErr = validateSessionGroupLabel(group, labelInput)
  if (glErr) return { ok: false, reason: glErr }

  const base = getSessionStorageDefaults(type)
  const encoding = resolveImportedEncoding(
    item,
    String(base.encoding ?? ''),
    warnings,
  )

  let backspaceMode = 'auto'
  if ('backspaceMode' in item && item.backspaceMode !== undefined) {
    const bm = normalizeBackspaceMode(item.backspaceMode)
    if (bm === null) {
      pushSessionImportWarning(warnings, 'fieldDefaulted', {
        field: 'backspaceMode',
        value: String(item.backspaceMode),
        result: 'auto',
      })
    } else {
      backspaceMode = bm
    }
  }

  const savedId = typeof item.savedId === 'string' && item.savedId.trim()
    ? item.savedId.trim()
    : `saved-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const savedAt = Number.isFinite(Number(item.savedAt)) ? Number(item.savedAt) : Date.now()
  if ('savedAt' in item && !Number.isFinite(Number(item.savedAt))) {
    pushSessionImportWarning(warnings, 'fieldDefaulted', {
      field: 'savedAt',
      value: String(item.savedAt),
      result: savedAt,
    })
  }

  const label = labelInput || buildSessionLabel(type, { ...item, type } as SessionFormValues)

  let session: SavedSession

  if (type === 'ssh') {
    const sshBase = getSessionStorageDefaults('ssh') as SshStorageDefaults
    const port = clampSessionPort(item.port, 22)
    if ('port' in item && item.port !== '' && item.port != null) {
      const rawN = typeof item.port === 'number' ? item.port : parseInt(String(item.port), 10)
      if (!Number.isFinite(rawN) || rawN < PORT_MIN || rawN > PORT_MAX) {
        pushSessionImportWarning(warnings, 'fieldDefaulted', {
          field: 'port',
          value: String(item.port),
          result: port,
        })
      }
    }

    let authType = sshBase.authType
    if ('authType' in item && item.authType !== undefined) {
      const auth = String(item.authType).trim()
      authType = AUTH_TYPE_SET.has(auth) ? auth : 'password'
      if (!AUTH_TYPE_SET.has(auth)) {
        pushSessionImportWarning(warnings, 'fieldDefaulted', {
          field: 'authType',
          value: auth,
          result: 'password',
        })
      }
    }

    let enableSftp = sshBase.enableSftp
    if ('enableSftp' in item && item.enableSftp !== undefined) {
      enableSftp = Boolean(item.enableSftp)
      if (typeof item.enableSftp !== 'boolean') {
        pushSessionImportWarning(warnings, 'fieldDefaulted', {
          field: 'enableSftp',
          value: String(item.enableSftp),
          result: String(enableSftp),
        })
      }
    }

    const sshSession: SshSavedSession = {
      type: 'ssh',
      savedId,
      savedAt,
      group,
      label,
      encoding,
      backspaceMode,
      host: String(item.host).trim(),
      port,
      username: String(item.username ?? '').trim(),
      authType,
      enableSftp,
    }
    if (typeof item.password === 'string') sshSession.password = item.password
    if (typeof item.privateKey === 'string') sshSession.privateKey = item.privateKey
    if (typeof item.passphrase === 'string') sshSession.passphrase = item.passphrase
    session = pickSessionStorageFields(sshSession) as SshSavedSession
    session.savedId = savedId
    session.savedAt = savedAt
  } else if (type === 'telnet') {
    const port = clampSessionPort(item.port, 23)
    if ('port' in item && item.port !== '' && item.port != null) {
      const rawN = typeof item.port === 'number' ? item.port : parseInt(String(item.port), 10)
      if (!Number.isFinite(rawN) || rawN < PORT_MIN || rawN > PORT_MAX) {
        pushSessionImportWarning(warnings, 'fieldDefaulted', {
          field: 'port',
          value: String(item.port),
          result: port,
        })
      }
    }

    const telnetSession: TelnetSavedSession = {
      type: 'telnet',
      savedId,
      savedAt,
      group,
      label,
      encoding,
      backspaceMode,
      host: String(item.host).trim(),
      port,
    }
    session = pickSessionStorageFields(telnetSession) as TelnetSavedSession
    session.savedId = savedId
    session.savedAt = savedAt
  } else {
    const serialBase = getSessionStorageDefaults('serial') as SerialStorageDefaults
    const serialFields: Partial<SerialSavedSession> = { type: 'serial' }
    applySerialStorageFieldsWithWarnings(serialFields, item, serialBase, warnings)

    const serialSession: SerialSavedSession = {
      type: 'serial',
      savedId,
      savedAt,
      group,
      label,
      encoding,
      backspaceMode,
      path: serialFields.path,
      baudRate: serialFields.baudRate,
      dataBits: serialFields.dataBits,
      stopBits: serialFields.stopBits,
      parity: serialFields.parity,
    }
    session = pickSessionStorageFields(serialSession) as SerialSavedSession
    session.savedId = savedId
    session.savedAt = savedAt
  }

  return { ok: true, session, warnings }
}
