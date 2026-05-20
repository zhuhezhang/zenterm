import { DEFAULT_ALGORITHM_PREFERENCES, SSH_ALGORITHM_OPTION_POOL, } from '../../../shared/sshAlgorithmDefaults.js'
import { DEFAULT_SETTINGS, SSH_ALGORITHM_SECTION_KEYS } from './defaults.js'
import {
  applyLegacyLoggingMigration, clampSidebarWidthPx, clampTerminalScrollback, normalizeImportedLogPath,
} from './normalize.js'

/**
 * 判断是否为纯对象
 * @param {unknown} raw 待判断的对象
 * @returns {boolean} 是否为纯对象
 */
function isPlainObject(raw) {
  return raw != null && typeof raw === 'object' && !Array.isArray(raw)
}

/**
 * 深拷贝当前设置，作为导入合并基底（缺字段时用 DEFAULT_SETTINGS 补齐）
 * @param {Record<string, unknown>} current 当前应用设置
 * @returns {Record<string, unknown>}
 */
function cloneCurrentSettings(current) {
  const base = { ...DEFAULT_SETTINGS, ...current }
  return {
    ...base,
    highlightRules: Array.isArray(base.highlightRules)
      ? base.highlightRules.map((r) => ({ ...r }))
      : DEFAULT_SETTINGS.highlightRules.map((r) => ({ ...r })),
    algorithmPreferences: {
      ...DEFAULT_ALGORITHM_PREFERENCES,
      ...(isPlainObject(base.algorithmPreferences) ? base.algorithmPreferences : {}),
    },
  }
}

/** 导入高亮规则时 enabled / useRegex / caseSensitive / color 的默认值（与设置界面新建规则一致） */
const HIGHLIGHT_RULE_FIELD_DEFAULTS = {
  enabled: true,
  useRegex: true,
  caseSensitive: false,
  color: '#ffcc00',
}

/**
 * 收集现有规则的 id / name（trim 后），用于导入去重
 * @param {unknown[]} rules 现有高亮规则列表
 * @returns {{ ids: Set<string>, names: Set<string> }}
 */
function collectHighlightRuleKeys(rules) {
  const ids = new Set()
  const names = new Set()
  for (const r of rules) {
    if (!isPlainObject(r)) continue
    if (typeof r.id === 'string' && r.id.trim()) ids.add(r.id.trim())
    if (typeof r.name === 'string' && r.name.trim()) names.add(r.name.trim())
  }
  return { ids, names }
}

/**
 * 导入时规范布尔字段：仅接受 boolean，否则用默认值
 * @param {unknown} raw 原始值
 * @param {boolean} fallback 默认值
 * @returns {boolean}
 */
function normalizeImportedHighlightBoolean(raw, fallback) {
  return typeof raw === 'boolean' ? raw : fallback
}

/**
 * 导入时规范颜色：非字符串或 trim 后为空则用默认值
 * @param {unknown} raw 原始值
 * @param {string} fallback 默认值
 * @returns {string}
 */
function normalizeImportedHighlightColor(raw, fallback) {
  if (typeof raw !== 'string') return fallback
  const c = raw.trim()
  return c || fallback
}

/**
 * 规范化导入的高亮规则：id / name / pattern 须有效；其余字段缺省或非法时用默认值
 * @param {unknown} raw 待规范的高亮规则
 * @returns {Record<string, unknown>|null} 规范化后的高亮规则
 */
function normalizeImportedHighlightRule(raw) {
  if (!isPlainObject(raw)) return null
  if (typeof raw.id !== 'string' || !raw.id.trim()) return null
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null
  if (typeof raw.pattern !== 'string' || !raw.pattern) return null

  const id = raw.id.trim()
  const name = raw.name.trim()
  const pattern = raw.pattern
  const enabled = normalizeImportedHighlightBoolean(raw.enabled, HIGHLIGHT_RULE_FIELD_DEFAULTS.enabled)
  const useRegex = normalizeImportedHighlightBoolean(raw.useRegex, HIGHLIGHT_RULE_FIELD_DEFAULTS.useRegex)
  const caseSensitive = normalizeImportedHighlightBoolean(
    raw.caseSensitive,
    HIGHLIGHT_RULE_FIELD_DEFAULTS.caseSensitive,
  )
  const color = normalizeImportedHighlightColor(raw.color, HIGHLIGHT_RULE_FIELD_DEFAULTS.color)
  if (useRegex) {
    try {
      new RegExp(pattern)
    } catch {
      return null
    }
  }
  return { id, name, enabled, useRegex, caseSensitive, pattern, color, }
}

/**
 * 将导入文件中合法且不重复的高亮规则追加到现有列表
 * @param {unknown[]} imported 导入文件中的规则数组
 * @param {unknown[]} currentRules 当前高亮规则
 * @returns {Record<string, unknown>[]}
 */
function mergeImportedHighlightRules(imported, currentRules) {
  const base = currentRules.map((r) => ({ ...r }))
  const { ids, names } = collectHighlightRuleKeys(base)
  for (const raw of imported) {
    const rule = normalizeImportedHighlightRule(raw)
    if (!rule) continue
    if (ids.has(rule.id) || names.has(rule.name)) continue
    base.push(rule)
    ids.add(rule.id)
    names.add(rule.name)
  }
  return base
}

/**
 * 规范化算法偏好（非法段或空列表保留 current 中对应项）
 * @param {unknown} raw 待规范的算法偏好
 * @param {Record<string, string[]>} current 当前算法偏好
 * @returns {Record<string, string[]>}
 */
function normalizeAlgorithmPreferences(raw, current) {
  const base = {
    ...DEFAULT_ALGORITHM_PREFERENCES,
    ...(isPlainObject(current) ? current : {}),
  }
  if (!isPlainObject(raw)) return base
  const out = { ...base }
  for (const key of SSH_ALGORITHM_SECTION_KEYS) {
    if (!Array.isArray(raw[key])) continue
    const pool = SSH_ALGORITHM_OPTION_POOL[key]
    const picked = raw[key].filter((v) => typeof v === 'string' && pool.includes(v))
    if (picked.length) out[key] = [...new Set(picked)]
  }
  return out
}

const APP_THEME_SET = new Set(['dark', 'light', 'auto'])
const UI_LANGUAGE_SET = new Set(['auto', 'en', 'zh'])
const LOGGING_MODE_SET = new Set(['none', 'stream', 'buffer'])

/**
 * 剥离未知键并规范各字段；非法字段保留 current，未出现在导入文件中的键不变
 * @param {Record<string, unknown>} raw 待剥离的设置
 * @param {Record<string, unknown>} currentSettings 导入前的当前设置
 * @returns {Promise<Record<string, unknown>>} 剥离后的设置
 */
export async function sanitizeImportedSettings(raw, currentSettings) {
  const current = cloneCurrentSettings(currentSettings)
  const stripped = {}
  for (const key of new Set(Object.keys(DEFAULT_SETTINGS))) {
    if (key in raw) stripped[key] = raw[key]
  }

  let out = { ...current, ...stripped }

  if ('appTheme' in stripped) {
    const v = String(out.appTheme)
    if (!APP_THEME_SET.has(v)) out.appTheme = current.appTheme
  }
  if ('uiLanguage' in stripped) {
    const v = String(out.uiLanguage)
    if (!UI_LANGUAGE_SET.has(v)) out.uiLanguage = current.uiLanguage
  }
  if ('confirmDeleteSession' in stripped) {
    if (typeof stripped.confirmDeleteSession !== 'boolean') {
      out.confirmDeleteSession = current.confirmDeleteSession
    }
  }
  if ('confirmDeleteGroup' in stripped) {
    if (typeof stripped.confirmDeleteGroup !== 'boolean') {
      out.confirmDeleteGroup = current.confirmDeleteGroup
    }
  }
  if ('deleteGroupWithSessions' in stripped) {
    if (typeof stripped.deleteGroupWithSessions !== 'boolean') {
      out.deleteGroupWithSessions = current.deleteGroupWithSessions
    }
  }
  if ('terminalInteract' in stripped) {
    if (typeof stripped.terminalInteract !== 'boolean') {
      out.terminalInteract = current.terminalInteract
    }
  }
  if ('saveSecretsToVault' in stripped) {
    if (typeof stripped.saveSecretsToVault !== 'boolean') {
      out.saveSecretsToVault = current.saveSecretsToVault
    }
  }
  if ('terminalScrollback' in stripped) {
    out.terminalScrollback = clampTerminalScrollback(
      stripped.terminalScrollback,
      /** @type {number} */ (current.terminalScrollback),
    )
  }
  if ('loggingMode' in stripped) {
    const v = String(stripped.loggingMode ?? '').trim().toLowerCase()
    if (!LOGGING_MODE_SET.has(v)) {
      out.loggingMode = current.loggingMode
    } else {
      out.loggingMode = v
    }
  }
  if ('logPath' in stripped) {
    out.logPath = await normalizeImportedLogPath(stripped.logPath, String(current.logPath ?? ''))
  }
  if ('sidebarWidth' in stripped) {
    out.sidebarWidth = clampSidebarWidthPx(
      stripped.sidebarWidth,
      typeof window !== 'undefined' ? window.innerWidth : 1200,
      /** @type {number} */ (current.sidebarWidth),
    )
  }
  if ('highlightRules' in stripped) {
    if (!Array.isArray(stripped.highlightRules)) {
      out.highlightRules = current.highlightRules.map((r) => ({ ...r }))
    } else {
      out.highlightRules = mergeImportedHighlightRules(
        stripped.highlightRules,
        /** @type {unknown[]} */ (current.highlightRules),
      )
    }
  }
  if ('algorithmPreferences' in stripped) {
    out.algorithmPreferences = normalizeAlgorithmPreferences(
      stripped.algorithmPreferences,
      /** @type {Record<string, string[]>} */ (current.algorithmPreferences),
    )
  }

  if ('enableLogging' in raw) {
    out = applyLegacyLoggingMigration({ ...out, enableLogging: raw.enableLogging })
  } else {
    out = applyLegacyLoggingMigration(out)
  }

  return out
}
