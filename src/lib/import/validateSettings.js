import {
  DEFAULT_ALGORITHM_PREFERENCES,
  SSH_ALGORITHM_OPTION_POOL,
} from '../../../shared/sshAlgorithmDefaults.js'
import { DEFAULT_TERMINAL_ENCODING } from '../../../shared/terminalEncodings.js'
import {
  DEFAULT_SETTINGS,
  SSH_ALGORITHM_SECTION_KEYS,
  applyLegacyLoggingMigration,
  clampSidebarWidthPx,
  clampTerminalScrollback,
  normalizeLoggingMode,
} from '../../store/settingsStore.js'
import { createImportError } from './importErrors.js'
import { readImportJson, unwrapExportPayload } from './parseImportFile.js'

const SETTINGS_KEYS = new Set(Object.keys(DEFAULT_SETTINGS))

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
function isPlainObject(raw) {
  return raw != null && typeof raw === 'object' && !Array.isArray(raw)
}

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>|null}
 */
function normalizeHighlightRule(raw) {
  if (!isPlainObject(raw)) return null
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const name = typeof raw.name === 'string' ? raw.name.trim() : id
  const pattern = typeof raw.pattern === 'string' ? raw.pattern : ''
  const color = typeof raw.color === 'string' ? raw.color.trim() : ''
  if (!id || !pattern || !color) return null
  if (raw.useRegex) {
    try {
      // eslint-disable-next-line no-new
      new RegExp(pattern)
    } catch {
      return null
    }
  }
  return {
    id,
    name: name || id,
    enabled: raw.enabled !== false,
    useRegex: !!raw.useRegex,
    caseSensitive: !!raw.caseSensitive,
    pattern,
    color,
  }
}

/**
 * @param {unknown} raw
 * @returns {Record<string, string[]>}
 */
function normalizeAlgorithmPreferences(raw) {
  const base = { ...DEFAULT_ALGORITHM_PREFERENCES }
  if (!isPlainObject(raw)) return base
  const out = { ...base }
  for (const key of SSH_ALGORITHM_SECTION_KEYS) {
    const pool = SSH_ALGORITHM_OPTION_POOL[key]
    if (!Array.isArray(raw[key])) continue
    const picked = raw[key]
      .filter((v) => typeof v === 'string' && pool.includes(v))
    if (picked.length) out[key] = [...new Set(picked)]
  }
  return out
}

/**
 * 剥离未知键并规范各字段（未知键静默丢弃）
 * @param {Record<string, unknown>} raw
 * @returns {Record<string, unknown>}
 */
export function sanitizeImportedSettings(raw) {
  /** @type {Record<string, unknown>} */
  const stripped = {}
  for (const key of SETTINGS_KEYS) {
    if (key in raw) stripped[key] = raw[key]
  }

  let out = { ...DEFAULT_SETTINGS, ...stripped }

  out.appTheme = ['dark', 'light', 'auto'].includes(String(out.appTheme))
    ? out.appTheme
    : DEFAULT_SETTINGS.appTheme
  out.uiLanguage = ['auto', 'en', 'zh'].includes(String(out.uiLanguage))
    ? out.uiLanguage
    : DEFAULT_SETTINGS.uiLanguage
  out.confirmDeleteSession = !!out.confirmDeleteSession
  out.confirmDeleteGroup = !!out.confirmDeleteGroup
  out.deleteGroupWithSessions = !!out.deleteGroupWithSessions
  out.terminalInteract = out.terminalInteract !== false
  out.saveSecretsToVault = !!out.saveSecretsToVault
  out.terminalScrollback = clampTerminalScrollback(out.terminalScrollback)
  out.loggingMode = normalizeLoggingMode(out.loggingMode)
  out.logPath = typeof out.logPath === 'string' ? out.logPath : ''
  out.sidebarWidth = clampSidebarWidthPx(
    out.sidebarWidth,
    typeof window !== 'undefined' ? window.innerWidth : 1200,
  )

  if (Array.isArray(out.highlightRules)) {
    out.highlightRules = out.highlightRules
      .map(normalizeHighlightRule)
      .filter(Boolean)
  }
  if (!out.highlightRules?.length) {
    out.highlightRules = DEFAULT_SETTINGS.highlightRules.map((r) => ({ ...r }))
  }

  out.algorithmPreferences = normalizeAlgorithmPreferences(out.algorithmPreferences)
  out = applyLegacyLoggingMigration(out)

  return out
}

/**
 * @param {File} file
 * @returns {Promise<Record<string, unknown>>}
 */
export async function validateAndParseSettingsImport(file) {
  const parsed = await readImportJson(file)
  const data = unwrapExportPayload(parsed, 'settings')
  if (!isPlainObject(data)) {
    throw createImportError('invalidPayload')
  }
  return sanitizeImportedSettings(/** @type {Record<string, unknown>} */ (data))
}
