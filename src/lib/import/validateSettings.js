import { DEFAULT_ALGORITHM_PREFERENCES, SSH_ALGORITHM_OPTION_POOL, } from '../../../shared/sshAlgorithmDefaults.js'
import {
  DEFAULT_SETTINGS, SSH_ALGORITHM_SECTION_KEYS,
  applyLegacyLoggingMigration, clampSidebarWidthPx, clampTerminalScrollback, normalizeLoggingMode,
} from '../../store/settingsStore.js'
import { createImportError } from './handleImportErrors.js'
import { readImportJson, unwrapExportPayload } from './parseImportFile.js'

/** 设置项键名集合 */
const SETTINGS_KEYS = new Set(Object.keys(DEFAULT_SETTINGS))

/**
 * 判断是否为纯对象
 * @param {unknown} raw 待判断的对象
 * @returns {boolean} 是否为纯对象
 */
function isPlainObject(raw) {
  return raw != null && typeof raw === 'object' && !Array.isArray(raw)
}

/**
 * 规范化高亮规则
 * @param {unknown} raw 待规范的高亮规则
 * @returns {Record<string, unknown>|null} 规范后的高亮规则
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
      new RegExp(pattern)  // 尝试创建正则表达式，如果失败则返回 null
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
 * 规范化算法偏好
 * @param {unknown} raw 待规范的算法偏好
 * @returns {Record<string, string[]>} 规范后的算法偏好
 */
function normalizeAlgorithmPreferences(raw) {
  const base = { ...DEFAULT_ALGORITHM_PREFERENCES }  // 默认算法偏好
  if (!isPlainObject(raw)) return base
  const out = { ...base }  // 输出算法偏好
  for (const key of SSH_ALGORITHM_SECTION_KEYS) {
    const pool = SSH_ALGORITHM_OPTION_POOL[key]
    if (!Array.isArray(raw[key])) continue  // 如果算法偏好不是数组，则跳过
    const picked = raw[key].filter((v) => typeof v === 'string' && pool.includes(v))  // 过滤掉非字符串或不在池中的算法偏好
    if (picked.length) out[key] = [...new Set(picked)]  // 如果算法偏好是数组，则去重
  }
  return out
}

/**
 * 剥离未知键并规范各字段（未知键静默丢弃）
 * @param {Record<string, unknown>} raw 待剥离的设置
 * @returns {Record<string, unknown>} 剥离后的设置
 */
function sanitizeImportedSettings(raw) {
  const stripped = {}  // 存储剥离后的设置
  for (const key of SETTINGS_KEYS) {
    if (key in raw) stripped[key] = raw[key]  // 如果设置项在原始设置中存在，则添加到剥离后的设置中
  }

  let out = { ...DEFAULT_SETTINGS, ...stripped }  // 合并默认设置和剥离后的设置

  out.appTheme = ['dark', 'light', 'auto'].includes(String(out.appTheme)) ? out.appTheme : DEFAULT_SETTINGS.appTheme  // 如果应用主题不是 dark、light 或 auto，则使用默认应用主题
  out.uiLanguage = ['auto', 'en', 'zh'].includes(String(out.uiLanguage)) ? out.uiLanguage : DEFAULT_SETTINGS.uiLanguage
  out.confirmDeleteSession = !!out.confirmDeleteSession  // 如果确认删除会话为 false，则转换为 true
  out.confirmDeleteGroup = !!out.confirmDeleteGroup  // 如果确认删除分组为 false，则转换为 true
  out.deleteGroupWithSessions = !!out.deleteGroupWithSessions  // 如果删除分组时同时删除会话为 false，则转换为 true
  out.terminalInteract = out.terminalInteract !== false  // 如果终端交互为 false，则转换为 true
  out.saveSecretsToVault = !!out.saveSecretsToVault  // 如果保存凭据到 vault 为 false，则转换为 true
  out.terminalScrollback = clampTerminalScrollback(out.terminalScrollback)  // 规范化终端滚动缓冲区
  out.loggingMode = normalizeLoggingMode(out.loggingMode)  // 规范化日志模式
  out.logPath = typeof out.logPath === 'string' ? out.logPath : ''  // 如果日志路径不是字符串，则转换为空字符串
  out.sidebarWidth = clampSidebarWidthPx(out.sidebarWidth, typeof window !== 'undefined' ? window.innerWidth : 1200)  // 规范化侧边栏宽度

  if (Array.isArray(out.highlightRules)) {  // 如果高亮规则是数组，则规范化高亮规则
    out.highlightRules = out.highlightRules
      .map(normalizeHighlightRule)
      .filter(Boolean)
  }
  if (!out.highlightRules?.length) {  // 如果高亮规则为空，则使用默认高亮规则
    out.highlightRules = DEFAULT_SETTINGS.highlightRules.map((r) => ({ ...r }))
  }

  out.algorithmPreferences = normalizeAlgorithmPreferences(out.algorithmPreferences)  // 规范化算法偏好
  out = applyLegacyLoggingMigration(out)

  return out
}

/**
 * 验证并解析设置导入文件
 * @param {File} file 导入的 JSON 文件对象
 * @returns {Promise<Record<string, unknown>>} 规范后的设置对象
 */
export async function validateAndParseSettingsImport(file) {
  const parsed = await readImportJson(file)
  const data = unwrapExportPayload(parsed, 'settings')
  if (!isPlainObject(data)) {
    throw createImportError('invalidPayload')
  }
  return sanitizeImportedSettings(/** @type {Record<string, unknown>} */ (data))
}
