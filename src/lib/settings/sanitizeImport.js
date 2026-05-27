import { DEFAULT_ALGORITHM_PREFERENCES } from '../../../shared/sshAlgorithmDefaults.js'
import { SSH_ALGORITHM_OPTION_POOL } from './sshAlgorithmOptions.js'
import { resolveEffectiveUiLanguage } from '../resolveUiLanguage.js'
import { DEFAULT_SETTINGS, SSH_ALGORITHM_SECTION_KEYS, TERMINAL_SCROLLBACK_MIN, TERMINAL_SCROLLBACK_MAX } from './defaults.js'
import { resolveHighlightRuleId, resolveHighlightRuleName } from './highlightRules.js'
import { pushSettingsImportWarning } from './importWarnings.js'
import {
  clampSidebarWidthPx, clampTerminalScrollback, normalizeImportedLogPath, normalizeLoggingMode,
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
 * @returns {boolean} 规范化后的布尔值
 */
function normalizeImportedHighlightBoolean(raw, fallback) {
  return typeof raw === 'boolean' ? raw : fallback
}

/**
 * 导入时规范颜色：非字符串或 trim 后为空则用默认值
 * @param {unknown} raw 原始值
 * @param {string} fallback 默认值
 * @returns {string} 规范化后的颜色
 */
function normalizeImportedHighlightColor(raw, fallback) {
  if (typeof raw !== 'string') return fallback
  const c = raw.trim()
  return c || fallback
}

/**
 * 获取高亮规则的拒绝原因
 * @param {unknown} raw 原始高亮规则
 * @returns {string|null} 拒绝原因码；null 表示可继续规范化
 */
function getHighlightRuleRejectReason(raw) {
  if (!isPlainObject(raw)) return 'invalidFormat'
  if (typeof raw.pattern !== 'string' || !raw.pattern) return 'missingPattern'
  const useRegex = normalizeImportedHighlightBoolean(raw.useRegex, HIGHLIGHT_RULE_FIELD_DEFAULTS.useRegex)
  if (useRegex) {
    try {
      new RegExp(raw.pattern)
    } catch {
      return 'invalidRegex'
    }
  }
  return null
}

/**
 * 规范化导入的高亮规则：pattern 须有效；id 由调用方解析；其余字段缺省或非法时用默认值
 * @param {unknown} raw 待规范的高亮规则
 * @param {string} id 已解析的规则 id
 * @returns {Record<string, unknown>|null} 规范化后的高亮规则
 */
function normalizeImportedHighlightRule(raw, id) {
  if (getHighlightRuleRejectReason(raw)) return null
  const r = /** @type {Record<string, unknown>} */ (raw)
  const pattern = r.pattern
  const enabled = normalizeImportedHighlightBoolean(r.enabled, HIGHLIGHT_RULE_FIELD_DEFAULTS.enabled)
  const useRegex = normalizeImportedHighlightBoolean(r.useRegex, HIGHLIGHT_RULE_FIELD_DEFAULTS.useRegex)
  const caseSensitive = normalizeImportedHighlightBoolean(
    r.caseSensitive,
    HIGHLIGHT_RULE_FIELD_DEFAULTS.caseSensitive,
  )
  const color = normalizeImportedHighlightColor(r.color, HIGHLIGHT_RULE_FIELD_DEFAULTS.color)
  return { id, enabled, useRegex, caseSensitive, pattern, color, name: r.name }
}

/**
 * 将导入文件中合法且不重复的高亮规则追加到现有列表；名称为空或缺失时自动生成「未命名规则 n」
 * @param {unknown[]} imported 导入文件中的规则数组
 * @param {unknown[]} currentRules 当前高亮规则
 * @param {'zh'|'en'} lang 用于自动生成规则名的界面语言
 * @param {import('./importWarnings.js').SettingsImportWarning[]} warnings 导入警告列表
 * @returns {Record<string, unknown>[]} 规范化后的高亮规则列表
 */
function mergeImportedHighlightRules(imported, currentRules, lang, warnings) {
  const base = currentRules.map((r) => ({ ...r }))
  const { ids, names } = collectHighlightRuleKeys(base)
  imported.forEach((raw, index) => {
    const oneBased = index + 1
    const reject = getHighlightRuleRejectReason(raw)
    if (reject) {
      pushSettingsImportWarning(warnings, 'highlightRuleSkipped', { index: oneBased, reason: reject })
      return
    }
    const id = resolveHighlightRuleId(
      isPlainObject(raw) ? raw.id : undefined,
      ids,
    )
    if (ids.has(id)) {
      pushSettingsImportWarning(warnings, 'highlightRuleSkipped', {
        index: oneBased, reason: 'duplicateId', id,
      })
      return
    }

    const rule = normalizeImportedHighlightRule(raw, id)
    if (!rule) return

    const name = resolveHighlightRuleName(rule.name, names, lang)
    if (names.has(name)) {
      pushSettingsImportWarning(warnings, 'highlightRuleSkipped', {
        index: oneBased, reason: 'duplicateName', name,
      })
      return
    }

    base.push({ ...rule, name })
    ids.add(rule.id)
    names.add(name)
  })
  return base
}

/**
 * 规范化算法偏好（非法段或空列表保留 current 中对应项）
 * @param {unknown} raw 待规范的算法偏好
 * @param {Record<string, string[]>} current 当前算法偏好
 * @param {import('./importWarnings.js').SettingsImportWarning[]} warnings 导入警告列表
 * @returns {Record<string, string[]>} 规范化后的算法偏好
 */
function normalizeAlgorithmPreferences(raw, current, warnings) {
  const base = {
    ...DEFAULT_ALGORITHM_PREFERENCES,
    ...(isPlainObject(current) ? current : {}),
  }
  if (!isPlainObject(raw)) return base
  const out = { ...base }
  for (const key of SSH_ALGORITHM_SECTION_KEYS) {
    if (!(key in raw)) continue
    if (!Array.isArray(raw[key])) {
      pushSettingsImportWarning(warnings, 'algorithmSectionInvalidType', { section: key })
      continue
    }
    const pool = SSH_ALGORITHM_OPTION_POOL[key]
    const rawList = raw[key]
    const picked = rawList.filter((v) => typeof v === 'string' && pool.includes(v))
    const unique = [...new Set(picked)]
    if (!unique.length) {
      if (rawList.length > 0) {
        pushSettingsImportWarning(warnings, 'algorithmSectionAllInvalid', { section: key })
      }
      continue
    }
    const skipped = rawList.length - unique.length
    if (skipped > 0) {
      pushSettingsImportWarning(warnings, 'algorithmSectionPartialInvalid', { section: key, skipped })
    }
    out[key] = unique
  }
  return out
}

/** 应用主题的值集合 */
const APP_THEME_SET = new Set(['dark', 'light', 'auto'])
/** 界面语言的值集合 */
const UI_LANGUAGE_SET = new Set(['auto', 'en', 'zh'])
/** 日志模式的值集合 */
const LOGGING_MODE_SET = new Set(['none', 'stream', 'buffer'])

/** 布尔设置项的键 */
const BOOLEAN_SETTING_KEYS = [
  'confirmDeleteSession',
  'confirmDeleteGroup',
  'deleteGroupWithSessions',
  'terminalInteract',
  'saveSecretsToVault',
]

/**
 * 剥离未知键并规范各字段；非法字段保留 current，未出现在导入文件中的键不变
 * @param {Record<string, unknown>} raw 待剥离的设置
 * @param {Record<string, unknown>} currentSettings 导入前的当前设置
 * @returns {Promise<{ settings: Record<string, unknown>, warnings: import('./importWarnings.js').SettingsImportWarning[] }>}
 */
export async function sanitizeImportedSettings(raw, currentSettings) {
  /** @type {import('./importWarnings.js').SettingsImportWarning[]} */
  const warnings = []
  const current = cloneCurrentSettings(currentSettings)
  const stripped = {}
  for (const key of new Set(Object.keys(DEFAULT_SETTINGS))) {
    if (key in raw) stripped[key] = raw[key]
  }

  let out = { ...current, ...stripped }

  if ('appTheme' in stripped) {  // 应用主题是否在导入文件中
    const v = String(out.appTheme)
    if (!APP_THEME_SET.has(v)) {
      out.appTheme = current.appTheme
      pushSettingsImportWarning(warnings, 'invalidEnum', { field: 'appTheme', value: v })
    }
  }
  if ('uiLanguage' in stripped) {  // 界面语言是否在导入文件中
    const v = String(out.uiLanguage)
    if (!UI_LANGUAGE_SET.has(v)) {
      out.uiLanguage = current.uiLanguage
      pushSettingsImportWarning(warnings, 'invalidEnum', { field: 'uiLanguage', value: v })
    }
  }
  for (const key of BOOLEAN_SETTING_KEYS) {
    if (!(key in stripped)) continue
    if (typeof stripped[key] !== 'boolean') {
      out[key] = current[key]
      pushSettingsImportWarning(warnings, 'invalidBoolean', { field: key })
    }
  }
  if ('terminalScrollback' in stripped) {
    const rawVal = stripped.terminalScrollback
    const next = clampTerminalScrollback(rawVal, /** @type {number} */ (current.terminalScrollback))
    out.terminalScrollback = next
    const n = Math.floor(Number(rawVal))
    if (!Number.isFinite(n) || n < TERMINAL_SCROLLBACK_MIN || n > TERMINAL_SCROLLBACK_MAX) {
      pushSettingsImportWarning(warnings, 'valueClamped', {
        field: 'terminalScrollback',
        value: String(rawVal),
        result: next,
      })
    }
  }
  if ('loggingMode' in stripped) {
    const v = String(stripped.loggingMode ?? '').trim().toLowerCase()
    if (!LOGGING_MODE_SET.has(v)) {
      out.loggingMode = current.loggingMode
      pushSettingsImportWarning(warnings, 'invalidEnum', { field: 'loggingMode', value: String(stripped.loggingMode ?? '') })
    } else {
      out.loggingMode = v
    }
  }
  if ('logPath' in stripped) {
    const fallback = String(current.logPath ?? '')
    const importedRaw = stripped.logPath
    if (typeof importedRaw !== 'string') {
      out.logPath = await normalizeImportedLogPath(importedRaw, fallback)
      pushSettingsImportWarning(warnings, 'logPathNotString', { field: 'logPath' })
    } else {
      const trimmed = importedRaw.trim()
      const next = await normalizeImportedLogPath(importedRaw, fallback)
      out.logPath = next
      if (trimmed && next === fallback && trimmed !== fallback) {
        pushSettingsImportWarning(warnings, 'logPathRejected', { field: 'logPath', value: trimmed })
      }
    }
  }
  if ('sidebarWidth' in stripped) {
    const rawVal = stripped.sidebarWidth
    const innerW = typeof window !== 'undefined' ? window.innerWidth : 1200
    const next = clampSidebarWidthPx(
      rawVal,
      innerW,
      /** @type {number} */ (current.sidebarWidth),
    )
    out.sidebarWidth = next
    const w = Math.floor(Number(rawVal))
    if (!Number.isFinite(w) || w !== next) {
      pushSettingsImportWarning(warnings, 'valueClamped', {
        field: 'sidebarWidth',
        value: String(rawVal),
        result: next,
      })
    }
  }
  if ('highlightRules' in stripped) {
    if (!Array.isArray(stripped.highlightRules)) {
      out.highlightRules = current.highlightRules.map((r) => ({ ...r }))
      pushSettingsImportWarning(warnings, 'highlightRulesNotArray')
    } else {
      const importLang = resolveEffectiveUiLanguage(
        'uiLanguage' in stripped ? String(out.uiLanguage) : String(current.uiLanguage ?? 'auto'),
      )
      out.highlightRules = mergeImportedHighlightRules(
        stripped.highlightRules,
        /** @type {unknown[]} */ (current.highlightRules),
        importLang,
        warnings,
      )
    }
  }
  if ('algorithmPreferences' in stripped) {
    if (!isPlainObject(stripped.algorithmPreferences)) {
      out.algorithmPreferences = {
        ...DEFAULT_ALGORITHM_PREFERENCES,
        ...(isPlainObject(current.algorithmPreferences) ? current.algorithmPreferences : {}),
      }
      pushSettingsImportWarning(warnings, 'algorithmPreferencesNotObject')
    } else {
      out.algorithmPreferences = normalizeAlgorithmPreferences(
        stripped.algorithmPreferences,
        /** @type {Record<string, string[]>} */ (current.algorithmPreferences),
        warnings,
      )
    }
  }

  out.loggingMode = normalizeLoggingMode(out.loggingMode)

  return { settings: out, warnings }
}
