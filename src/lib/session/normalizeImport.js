import { normalizeTerminalEncoding } from '../../../shared/terminalEncodings.js'
import { getSessionStorageDefaults } from './constants.js'
import {
  normalizeBackspaceMode,
  clampSessionPort,
  buildSessionLabel,
  validateSessionGroupLabel,
  pickSessionStorageFields,
  applySerialStorageFields,
  SESSION_TYPE_SET,
  AUTH_TYPE_SET,
} from './utils.js'

/**
 * 将导入的原始会话规范为可保存结构（逻辑对齐 ConnectDialog.buildConfig + 保存会话）
 * @param {unknown} raw
 * @returns {{ ok: true, session: Record<string, unknown> } | { ok: false, reason: string }}
 */
export function normalizeImportedSession(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'notObject' }
  }
  const item = /** @type {Record<string, unknown>} */ (raw)
  const type = String(item.type ?? '').trim().toLowerCase()
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
  const merged = { ...base, ...item, type, group }

  if (type === 'ssh' || type === 'telnet') {
    merged.host = String(item.host).trim()
    merged.port = clampSessionPort(item.port, type === 'ssh' ? 22 : 23)
    if (type === 'ssh') {
      const auth = String(item.authType ?? base.authType).trim()
      merged.authType = AUTH_TYPE_SET.has(auth) ? auth : 'password'
      merged.username = String(item.username ?? '').trim()
      merged.enableSftp = Boolean(item.enableSftp)
    } else {
      merged.username = String(item.username ?? '').trim()
    }
  } else {
    applySerialStorageFields(merged, item, base)
  }

  merged.encoding = normalizeTerminalEncoding(
    typeof item.encoding === 'string' ? item.encoding : base.encoding,
  )
  merged.backspaceMode = normalizeBackspaceMode(item.backspaceMode) ?? 'auto'
  merged.label = labelInput || buildSessionLabel(type, merged)

  const savedId =
    typeof item.savedId === 'string' && item.savedId.trim()
      ? item.savedId.trim()
      : `saved-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const savedAt = Number.isFinite(Number(item.savedAt)) ? Number(item.savedAt) : Date.now()

  const stored = pickSessionStorageFields(merged)
  const session = { ...stored, label: merged.label, savedId, savedAt }

  if (type === 'ssh') {
    if (typeof item.password === 'string') session.password = item.password
    if (typeof item.privateKey === 'string') session.privateKey = item.privateKey
    if (typeof item.passphrase === 'string') session.passphrase = item.passphrase
  } else if (type === 'telnet') {
    if (typeof item.password === 'string') session.password = item.password
  }

  return { ok: true, session }
}
