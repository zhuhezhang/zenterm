import {
  PORT_MIN, PORT_MAX, SESSION_TYPE_FIELDS, BAUD_RATE_SET, PARITY_SET,
  LABEL_ILLEGAL_CHARS_RE, GROUP_ILLEGAL_CHARS_RE, getSessionFormDefaults,
} from './defaults.js'

/**
 * 规范化退格模式
 * @param {string} v 待规范的退格模式
 * @returns {'auto'|'del'|'bs'|null} 规范化后的退格模式
 */
export function normalizeBackspaceMode(v) {
  const s = String(v ?? '').toLowerCase()
  return s === 'auto' || s === 'del' || s === 'bs' ? s : null
}

/**
 * 端口输入框：严格限制在 0–65535；空字符串保留便于清空重输
 * @param {string} raw 待规范的端口
 * @returns {string} 规范化后的端口
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
 * @param {unknown} raw 待规范的端口
 * @param {number} fallback 默认端口
 * @returns {number} 规范化后的端口
 */
export function clampSessionPort(raw, fallback) {
  if (raw === '' || raw == null) return fallback
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(PORT_MAX, Math.max(PORT_MIN, n))
}

/**
 * 构建连接配置：空或非法端口返回 undefined
 * @param {unknown} raw 待规范的端口
 * @returns {number|undefined} 规范化后的端口
 */
export function parseSessionPort(raw) {
  const s = String(raw ?? '').trim()
  if (s === '') return undefined
  const n = parseInt(s, 10)
  if (!Number.isFinite(n)) return undefined
  return Math.min(PORT_MAX, Math.max(PORT_MIN, n))
}

/**
 * 构建会话标签
 * @param {string} tab 会话类型
 * @param {Record<string, unknown>} form 表单数据
 * @returns {string} 构建后的会话标签
 */
export function buildSessionLabel(tab, form) {
  if (tab === 'serial') {
    const raw = String(form.path || 'Serial')
    return raw.replace(new RegExp(LABEL_ILLEGAL_CHARS_RE.source, 'g'), '').trim() || 'Serial'
  }
  if (tab === 'telnet') {
    const raw = String(form.host || 'Telnet')
    return raw.replace(new RegExp(LABEL_ILLEGAL_CHARS_RE.source, 'g'), '').trim() || 'Telnet'
  }
  const raw = (form.username ? String(form.username) + '@' : '') + (form.host || tab.toUpperCase())
  return raw.replace(new RegExp(LABEL_ILLEGAL_CHARS_RE.source, 'g'), '').trim() || tab.toUpperCase()
}

/**
 * 验证会话分组和标签
 * @param {string} [group] 会话分组
 * @param {string} [label] 会话标签
 * @returns {string|null} 验证结果
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

/**
 * 合并表单默认值和初始值
 * @param {string} tab 会话类型
 * @param {Object} [initial] 初始表单数据
 * @returns {Record<string, unknown>} 合并后的表单数据
 */
export function mergeSessionFormDefaults(tab, initial) {
  const base = getSessionFormDefaults(tab)
  const merged = initial ? { ...base, ...initial } : { ...base }
  merged.backspaceMode = normalizeBackspaceMode(merged.backspaceMode) ?? 'auto'
  return merged
}

/**
 * 选择需要保存的字段
 * @param {Record<string, unknown>} config 待选择的字段
 * @returns {Record<string, unknown>} 选择后的字段
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
 * 应用串口存储字段
 * @param {Record<string, unknown>} item 待应用的字段
 * @param {Record<string, unknown>} base 基础字段
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
