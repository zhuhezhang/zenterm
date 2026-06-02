import type {
  BackspaceMode,
  PickedSessionFields,
  RawImportedSession,
  SavedSession,
  SerialSavedSession,
  SessionConfig,
  SessionFormValues,
  SessionGroupLabelError,
  SessionType,
  SshSavedSession,
  TelnetSavedSession,
} from '../../types/session'
import type { SerialStorageDefaults, SessionStorageDefaults } from './defaults'
import {
  PORT_MIN,
  PORT_MAX,
  SESSION_TYPE_FIELDS,
  BAUD_RATE_SET,
  PARITY_SET,
  LABEL_ILLEGAL_CHARS_RE,
  hasInvalidLabelChars,
  hasInvalidGroupChars,
  getSessionFormDefaults,
} from './defaults'

export function normalizeBackspaceMode(v: string | number | boolean | null | undefined): BackspaceMode | null {
  const s = String(v ?? '').toLowerCase()
  return s === 'auto' || s === 'del' || s === 'bs' ? s : null
}

export function clampPortFieldString(raw: string | number | null | undefined): string {
  const s = String(raw ?? '').trim()
  if (s === '') return ''
  const n = parseInt(s, 10)
  if (Number.isNaN(n)) return ''
  return String(Math.min(PORT_MAX, Math.max(PORT_MIN, n)))
}

export function clampSessionPort(raw: string | number | null | undefined, fallback: number): number {
  if (raw === '' || raw == null) return fallback
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(PORT_MAX, Math.max(PORT_MIN, n))
}

export function parseSessionPort(raw: string | number | null | undefined): number | undefined {
  const s = String(raw ?? '').trim()
  if (s === '') return undefined
  const n = parseInt(s, 10)
  if (!Number.isFinite(n)) return undefined
  return Math.min(PORT_MAX, Math.max(PORT_MIN, n))
}

export function buildSessionLabel(
  tab: SessionType | string,
  form: SessionFormValues,
): string {
  if (tab === 'serial') {
    const raw = String(form.path || 'Serial')
    return raw.replace(LABEL_ILLEGAL_CHARS_RE, '').trim() || 'Serial'
  }
  if (tab === 'telnet') {
    const raw = String(form.host || 'Telnet')
    return raw.replace(LABEL_ILLEGAL_CHARS_RE, '').trim() || 'Telnet'
  }
  const raw =
    (form.username ? String(form.username) + '@' : '') +
    (form.host || String(tab).toUpperCase())
  return raw.replace(LABEL_ILLEGAL_CHARS_RE, '').trim() || String(tab).toUpperCase()
}

export function validateSessionGroupLabel(
  group?: string,
  label?: string,
): SessionGroupLabelError | null {
  const g = group ?? ''
  const l = label ?? ''
  if (g.startsWith('/')) return 'groupSlashStart'
  if (g.endsWith('/')) return 'groupSlashEnd'
  if (g && hasInvalidGroupChars(g)) return 'groupIllegalChars'
  if (l && hasInvalidLabelChars(l)) return 'labelIllegalChars'
  return null
}

export function mergeSessionFormDefaults(
  tab: SessionType | string,
  initial?: SessionConfig | SessionFormValues,
): SessionFormValues {
  const base = getSessionFormDefaults(tab as SessionType)
  const merged: SessionFormValues = initial ? { ...base, ...initial } : { ...base }
  merged.backspaceMode = normalizeBackspaceMode(merged.backspaceMode) ?? 'auto'
  return merged
}

export function pickSessionStorageFields(config: SessionConfig): PickedSessionFields {
  const type = (config?.type ?? 'ssh') as SessionType
  const allowed =
    SESSION_TYPE_FIELDS[type as keyof typeof SESSION_TYPE_FIELDS] ?? []
  const picked: Record<string, string | number | boolean> = {}
  for (const key of allowed) {
    const v = config[key as keyof SessionConfig]
    if (v !== undefined && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
      picked[key] = v
    }
  }
  return {
    type,
    label: String(config.label ?? ''),
    group: String(config.group ?? ''),
    ...picked,
  } as PickedSessionFields
}

export function applySerialStorageFields(
  merged: Partial<SerialSavedSession>,
  item: RawImportedSession,
  base: SerialStorageDefaults,
): void {
  merged.path = String(item.path).trim()
  const baud = parseInt(String(item.baudRate ?? base.baudRate), 10)
  merged.baudRate = Number.isFinite(baud) ? baud : base.baudRate
  const dataBits = parseInt(String(item.dataBits ?? base.dataBits), 10)
  merged.dataBits = Number.isFinite(dataBits) ? dataBits : base.dataBits
  const stopBits = parseInt(String(item.stopBits ?? base.stopBits), 10)
  merged.stopBits = Number.isFinite(stopBits) ? stopBits : base.stopBits
  const parity = String(item.parity ?? base.parity).toLowerCase()
  merged.parity = PARITY_SET.has(parity) ? parity : 'none'
  if (!BAUD_RATE_SET.has(String(merged.baudRate))) {
    merged.baudRate = base.baudRate
  }
}
