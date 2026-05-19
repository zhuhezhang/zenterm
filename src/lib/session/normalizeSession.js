import { normalizeTerminalEncoding } from '../../../shared/terminalEncodings.js'
import { getSessionStorageDefaults, SESSION_TYPE_SET, AUTH_TYPE_SET } from './constants.js'
import {
  normalizeBackspaceMode, clampSessionPort, buildSessionLabel, validateSessionGroupLabel,
  pickSessionStorageFields, applySerialStorageFields,
} from './utils.js'

/**
 * 将导入的原始会话规范为可保存结构（逻辑对齐 ConnectDialog.buildConfig + 保存会话）
 * @param {unknown} raw 待规范的会话
 * @returns {{ ok: true, session: Record<string, unknown> } | { ok: false, reason: string }} 规范后的会话
 */
export function normalizeImportedSession(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {  // 如果原始会话不是对象或数组，则返回错误
    return { ok: false, reason: 'notObject' }
  }
  const item = /** @type {Record<string, unknown>} */ (raw)  // 将原始会话转换为对象
  const type = String(item.type ?? '').trim().toLowerCase()
  if (!SESSION_TYPE_SET.has(type)) return { ok: false, reason: 'invalidType' }  // 如果会话类型不在允许的类型列表中，则返回错误

  if (type === 'ssh' || type === 'telnet') {
    if (!String(item.host ?? '').trim()) return { ok: false, reason: 'missingHost' }  // 如果会话主机为空，则返回错误
  }
  if (type === 'serial') {
    if (!String(item.path ?? '').trim()) return { ok: false, reason: 'missingPath' }  // 如果会话路径为空，则返回错误
  }

  const group = String(item.group ?? '').trim()  // 获取会话分组
  const labelInput = String(item.label ?? '').trim()
  const glErr = validateSessionGroupLabel(group, labelInput)  // 验证会话分组和标签
  if (glErr) return { ok: false, reason: glErr }

  const base = getSessionStorageDefaults(type)
  const merged = { ...base, ...item, type, group }  // 合并默认值和原始值

  if (type === 'ssh' || type === 'telnet') {  // 如果是 SSH 或 Telnet 会话，则设置主机和端口
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

  merged.encoding = normalizeTerminalEncoding(  // 规范化终端编码
    typeof item.encoding === 'string' ? item.encoding : base.encoding,
  )
  merged.backspaceMode = normalizeBackspaceMode(item.backspaceMode) ?? 'auto'  // 规范化退格模式
  merged.label = labelInput || buildSessionLabel(type, merged)  // 构建会话标签

  const savedId = typeof item.savedId === 'string' && item.savedId.trim()
      ? item.savedId.trim()
      : `saved-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`  // 生成保存 ID
  const savedAt = Number.isFinite(Number(item.savedAt)) ? Number(item.savedAt) : Date.now()  // 生成保存时间

  const stored = pickSessionStorageFields(merged)  // 选择需要保存的字段
  const session = { ...stored, label: merged.label, savedId, savedAt }  // 合并保存 ID 和保存时间

  if (type === 'ssh') {  // 如果是 SSH 会话，则设置密码
    if (typeof item.password === 'string') session.password = item.password
    if (typeof item.privateKey === 'string') session.privateKey = item.privateKey  // 设置私钥
    if (typeof item.passphrase === 'string') session.passphrase = item.passphrase  // 设置 passphrase
  } else if (type === 'telnet') {  // 如果是 Telnet 会话，则设置密码
    if (typeof item.password === 'string') session.password = item.password  // 设置密码
  }

  return { ok: true, session }  // 返回规范后的会话
}
