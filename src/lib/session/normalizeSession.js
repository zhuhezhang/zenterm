import { TERMINAL_ENCODING_OPTIONS, normalizeTerminalEncoding } from '../terminalEncodingService.js'
import {
  getSessionStorageDefaults, SESSION_TYPE_SET, AUTH_TYPE_SET, BAUD_RATE_SET, PARITY_SET, PORT_MIN, PORT_MAX,
} from './defaults.js'
import { pushSessionImportWarning } from './importWarnings.js'
import {
  normalizeBackspaceMode, clampSessionPort, buildSessionLabel, validateSessionGroupLabel,
  pickSessionStorageFields,
} from './utils.js'

/** 允许的终端编码的值集合 */
const ALLOWED_TERMINAL_ENCODINGS = new Set(TERMINAL_ENCODING_OPTIONS.map((o) => o.value))

/**
 * 解析导入的终端编码
 * @param {unknown} raw 原始终端编码
 * @param {string} fallback 默认编码
 * @param {import('./importWarnings.js').SessionImportWarning[]} warnings 导入警告列表
 * @returns {string} 规范化后的终端编码
 */
function resolveImportedEncoding(raw, fallback, warnings) {
  const baseEnc = normalizeTerminalEncoding(fallback)
  if (!('encoding' in /** @type {Record<string, unknown>} */ (raw))) {
    return baseEnc
  }
  const item = /** @type {Record<string, unknown>} */ (raw)
  if (typeof item.encoding !== 'string' || !item.encoding.trim()) {
    pushSessionImportWarning(warnings, 'fieldDefaulted', {
      field: 'encoding',
      value: String(item.encoding ?? ''),
      result: baseEnc,
    })
    return baseEnc
  }
  const norm = normalizeTerminalEncoding(item.encoding)
  if (!ALLOWED_TERMINAL_ENCODINGS.has(norm)) {
    pushSessionImportWarning(warnings, 'fieldDefaulted', {
      field: 'encoding',
      value: item.encoding,
      result: baseEnc,
    })
    return baseEnc
  }
  return norm
}

/**
 * 应用串口存储字段并记录警告
 * @param {Record<string, unknown>} merged 合并后的会话
 * @param {Record<string, unknown>} item 原始会话
 * @param {Record<string, unknown>} base 基础会话
 * @param {import('./importWarnings.js').SessionImportWarning[]} warnings 导入警告列表
 */
function applySerialStorageFieldsWithWarnings(merged, item, base, warnings) {
  merged.path = String(item.path).trim()

  if ('baudRate' in item) {
    const baud = parseInt(String(item.baudRate), 10)
    if (!Number.isFinite(baud) || !BAUD_RATE_SET.has(String(baud))) {
      pushSessionImportWarning(warnings, 'fieldDefaulted', {
        field: 'baudRate',
        value: String(item.baudRate),
        result: base.baudRate,
      })
      merged.baudRate = base.baudRate
    } else {
      merged.baudRate = baud
    }
  } else {
    merged.baudRate = base.baudRate
  }

  if ('dataBits' in item) {
    const dataBits = parseInt(String(item.dataBits), 10)
    if (!Number.isFinite(dataBits)) {
      pushSessionImportWarning(warnings, 'fieldDefaulted', {
        field: 'dataBits',
        value: String(item.dataBits),
        result: base.dataBits,
      })
      merged.dataBits = base.dataBits
    } else {
      merged.dataBits = dataBits
    }
  } else {
    merged.dataBits = base.dataBits
  }

  if ('stopBits' in item) {
    const stopBits = parseInt(String(item.stopBits), 10)
    if (!Number.isFinite(stopBits)) {
      pushSessionImportWarning(warnings, 'fieldDefaulted', {
        field: 'stopBits',
        value: String(item.stopBits),
        result: base.stopBits,
      })
      merged.stopBits = base.stopBits
    } else {
      merged.stopBits = stopBits
    }
  } else {
    merged.stopBits = base.stopBits
  }

  if ('parity' in item) {
    const parity = String(item.parity).toLowerCase()
    if (!PARITY_SET.has(parity)) {
      pushSessionImportWarning(warnings, 'fieldDefaulted', {
        field: 'parity',
        value: String(item.parity),
        result: base.parity,
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
 * @param {unknown} raw 待规范的会话
 * @returns {{ ok: true, session: Record<string, unknown>, warnings: import('./importWarnings.js').SessionImportWarning[] } | { ok: false, reason: string }} 规范化后的会话或规范化失败的原因
 */
export function normalizeImportedSession(raw) {
  /** @type {import('./importWarnings.js').SessionImportWarning[]} */
  const warnings = []

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
    const portFallback = type === 'ssh' ? 22 : 23
    merged.port = clampSessionPort(item.port, portFallback)
    if ('port' in item && item.port !== '' && item.port != null) {
      const rawN = typeof item.port === 'number' ? item.port : parseInt(String(item.port), 10)
      if (!Number.isFinite(rawN) || rawN < PORT_MIN || rawN > PORT_MAX) {
        pushSessionImportWarning(warnings, 'fieldDefaulted', {
          field: 'port',
          value: String(item.port),
          result: merged.port,
        })
      }
    }
    if (type === 'ssh') {
      if ('authType' in item) {
        const auth = String(item.authType).trim()
        merged.authType = AUTH_TYPE_SET.has(auth) ? auth : 'password'
        if (!AUTH_TYPE_SET.has(auth)) {
          pushSessionImportWarning(warnings, 'fieldDefaulted', {
            field: 'authType',
            value: auth,
            result: 'password',
          })
        }
      } else {
        merged.authType = base.authType
      }
      merged.username = String(item.username ?? '').trim()
      if ('enableSftp' in item) {
        merged.enableSftp = Boolean(item.enableSftp)
        if (typeof item.enableSftp !== 'boolean') {
          pushSessionImportWarning(warnings, 'fieldDefaulted', {
            field: 'enableSftp',
            value: String(item.enableSftp),
            result: String(merged.enableSftp),
          })
        }
      } else {
        merged.enableSftp = base.enableSftp
      }
    }
  } else {
    applySerialStorageFieldsWithWarnings(merged, item, base, warnings)
  }

  merged.encoding = resolveImportedEncoding(item, base.encoding, warnings)

  if ('backspaceMode' in item) {
    const bm = normalizeBackspaceMode(item.backspaceMode)
    if (bm === null) {
      pushSessionImportWarning(warnings, 'fieldDefaulted', {
        field: 'backspaceMode',
        value: String(item.backspaceMode),
        result: 'auto',
      })
      merged.backspaceMode = 'auto'
    } else {
      merged.backspaceMode = bm
    }
  } else {
    merged.backspaceMode = 'auto'
  }

  merged.label = labelInput || buildSessionLabel(type, merged)

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

  const stored = pickSessionStorageFields(merged)
  const session = { ...stored, label: merged.label, savedId, savedAt }

  if (type === 'ssh') {
    if (typeof item.password === 'string') session.password = item.password
    if (typeof item.privateKey === 'string') session.privateKey = item.privateKey
    if (typeof item.passphrase === 'string') session.passphrase = item.passphrase
  }

  return { ok: true, session, warnings }
}
