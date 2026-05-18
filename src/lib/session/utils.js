import {
  PORT_MIN,
  PORT_MAX,
  SESSION_TYPE_FIELDS,
  AUTH_TYPES,
  BAUD_RATE_SET,
  PARITY_SET,
  LABEL_ILLEGAL_CHARS_RE,
  GROUP_ILLEGAL_CHARS_RE,
  getSessionFormDefaults,
} from './constants.js'

/**
 * @param {string} v
 * @returns {'auto'|'del'|'bs'|null}
 */
export function normalizeBackspaceMode(v) {
  const s = String(v ?? '').toLowerCase()
  return s === 'auto' || s === 'del' || s === 'bs' ? s : null
}

/**
 * 端口输入框：严格限制在 0–65535；空字符串保留便于清空重输
 * @param {string} raw
 * @returns {string}
 */
export function clampPortFieldString(raw) {
  const s = String(raw ?? '').trim()
  if (s === '') return ''
  const n = parseInt(s, 10)
  if (Number.isNaN(n)) return ''
  return String(Math.min(PORT_MAX, Math.max(PORT_MIN, n)))
}

/**
 * 保存/导入：无效或空值时使用 fallback
 * @param {unknown} raw
 * @param {number} fallback
 * @returns {number}
 */
export function clampSessionPort(raw, fallback) {
  if (raw === '' || raw == null) return fallback
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(PORT_MAX, Math.max(PORT_MIN, n))
}

/**
 * 构建连接配置：空或非法端口返回 undefined
 * @param {unknown} raw
 * @returns {number|undefined}
 */
export function parseSessionPort(raw) {
  const s = String(raw ?? '').trim()
  if (s === '') return undefined
  const n = parseInt(s, 10)
  if (!Number.isFinite(n)) return undefined
  return Math.min(PORT_MAX, Math.max(PORT_MIN, n))
}

/**
 * @param {string} tab
 * @param {Record<string, unknown>} form
 * @returns {string}
 */
export function buildSessionLabel(tab, form) {
  if (tab === 'serial') {
    const raw = String(form.path || 'Serial')
    return raw.replace(new RegExp(LABEL_ILLEGAL_CHARS_RE.source, 'g'), '').trim() || 'Serial'
  }
  const raw = (form.username ? String(form.username) + '@' : '') + (form.host || tab.toUpperCase())
  return raw.replace(new RegExp(LABEL_ILLEGAL_CHARS_RE.source, 'g'), '').trim() || tab.toUpperCase()
}

/**
 * @param {string} [group]
 * @param {string} [label]
 * @returns {string|null}
 */
export function validateSessionGroupLabel(group, label) {
  const g = group ?? ''
  const l = label ?? ''
  if (g.startsWith('/')) return 'groupSlashStart'
  if (g.endsWith('/')) return 'groupSlashEnd'
  if (g && GROUP_ILLEGAL_CHARS_RE.test(g)) return 'groupIllegalChars'
  if (l && LABEL_ILLEGAL_CHARS_RE.test(l)) return 'labelIllegalChars'
  return null
}

/** validateSessionGroupLabel 返回码 → connect.* i18n 键 */
export const SESSION_GROUP_LABEL_ERROR_KEYS = {
  groupSlashStart: 'connect.errGroupSlashStart',
  groupSlashEnd: 'connect.errGroupSlashEnd',
  groupIllegalChars: 'connect.errGroupChars',
  labelIllegalChars: 'connect.errLabelChars',
}

/**
 * @param {string} tab
 * @param {Object} [initial]
 * @param {string} [globalBackspace]
 * @returns {Object}
 */
export function mergeSessionFormDefaults(tab, initial, globalBackspace) {
  const base = getSessionFormDefaults(tab)
  const merged = initial ? { ...base, ...initial } : { ...base }
  merged.backspaceMode = normalizeBackspaceMode(merged.backspaceMode)
    ?? normalizeBackspaceMode(globalBackspace)
    ?? 'auto'
  return merged
}

/**
 * @param {Record<string, unknown>} config
 * @returns {Record<string, unknown>}
 */
export function pickSessionStorageFields(config) {
  const type = config?.type
  const allowed = SESSION_TYPE_FIELDS[type] || []
  const picked = {}
  for (const key of allowed) {
    if (config[key] !== undefined) picked[key] = config[key]
  }
  return {
    type,
    label: config.label,
    group: config.group,
    ...picked,
  }
}

/**
 * @param {Record<string, unknown>} item
 * @param {Record<string, unknown>} base
 * @returns {void}
 */
export function applySerialStorageFields(merged, item, base) {
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

const AUTH_TYPE_SET = new Set(AUTH_TYPES)
const SESSION_TYPE_SET = new Set(['ssh', 'telnet', 'serial'])

export { SESSION_TYPE_SET, AUTH_TYPE_SET }
