import { DEFAULT_ALGORITHM_PREFERENCES } from '../../shared/sshAlgorithmDefaults'
import type { AppSettings } from '../types/settings'
import type { TranslateFn } from '../types/i18n'
import type { SettingsImportWarning } from '../types/import'
import { syncUiLanguageToMain } from '../lib/resolveUiLanguage'
import { downloadJsonExport } from '../lib/import/downloadJsonExport'
import { validateAndParseSettingsImport } from '../lib/import/parseSettingsImport'
import {
 DEFAULT_SETTINGS, TERMINAL_SCROLLBACK_MIN, TERMINAL_SCROLLBACK_MAX,
} from '../lib/settings/defaults'
import {
  clampSidebarWidthPx, clampTerminalScrollback, normalizeLoggingMode,
} from '../lib/settings/normalize'
import { ipcPathFromResponse } from '../lib/ipc/ipcResponse'

/** 本地存储设置的键名 */
const SETTINGS_KEY = 'zterm_settings'
/** 默认放在系统下载目录下的日志子文件夹名 */
export const LOG_PATH_SUBFOLDER = 'zterm-session-log'

/** 由 app:getDownloadsPath invoke 填充的系统下载目录缓存 */
let cachedDownloadsPath = ''

/**
 * 拉取并缓存系统下载目录（app:getDownloadsPath）
 * @returns {Promise<string>}
 */
export async function refreshDownloadsPathCache() {
  try {
    const res = await window?.zterm?.paths?.getDownloadsPath?.()
    cachedDownloadsPath = ipcPathFromResponse(res)
  } catch {
    cachedDownloadsPath = ''
  }
  return cachedDownloadsPath
}

/** @returns {string} 已缓存的系统下载目录 */
export function getDownloadsPathCached() {
  return cachedDownloadsPath
}

/**
 * 将下载根目录拼成默认日志子目录路径
 * @param {string} base 系统下载目录
 * @returns {string}
 */
function buildDefaultLogPathFromBase(base: string) {
  if (!base || typeof base !== 'string') return ''
  const trimmed = base.replace(/[/\\]+$/, '')
  const sep = trimmed.includes('\\') ? '\\' : '/'
  return `${trimmed}${sep}${LOG_PATH_SUBFOLDER}`
}

/**
 * 默认日志目录：系统下载目录下的 zterm-session-log（需先 refreshDownloadsPathCache）
 * @returns {string} 默认日志目录
 */
export function getDefaultLogPath() {
  return buildDefaultLogPathFromBase(cachedDownloadsPath)
}

/**
 * 解析实际用于写入日志的目录：自定义路径优先，否则为默认子目录，再否则退回下载根目录
 * @param {{ logPath?: string }} [settings] 当前应用设置
 * @returns {string} 实际用于写入日志的目录
 */
export function resolveLoggingDirectory(settings?: Pick<AppSettings, 'logPath'>) {
  try {
    const custom = settings?.logPath != null ? String(settings.logPath).trim() : ''
    if (custom) return custom
    return getDefaultLogPath() || cachedDownloadsPath || ''
  } catch {
    return ''
  }
}

/**
 * 加载设置项，从 localStorage 获取并解析 JSON，如果失败则返回默认设置
 * @returns {Object} 设置项对象
 */
export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    const saved = raw ? JSON.parse(raw) : {}
    if (saved.algorithmPreferences && typeof saved.algorithmPreferences === 'object') {
      saved.algorithmPreferences = {
        ...DEFAULT_ALGORITHM_PREFERENCES,
        ...saved.algorithmPreferences,
      }
    }
    let merged = { ...DEFAULT_SETTINGS, ...saved }
    merged.terminalScrollback = clampTerminalScrollback(merged.terminalScrollback)
    merged.loggingMode = normalizeLoggingMode(merged.loggingMode)
    if (!('logPath' in saved)) {
      const def = getDefaultLogPath()
      if (def) merged.logPath = def
    }
    if (!['auto', 'en', 'zh'].includes(merged.uiLanguage)) merged.uiLanguage = 'auto'
    if (!['dark', 'light', 'auto'].includes(merged.appTheme)) merged.appTheme = 'auto'
    merged.sidebarWidth = clampSidebarWidthPx(merged.sidebarWidth, typeof window !== 'undefined' ? window.innerWidth : 1200)
    return merged
  } catch (e) {
    return { ...DEFAULT_SETTINGS }
  }
}

/**
 * 保存设置项，将设置对象序列化为 JSON 存储到 localStorage 中
 * @param {Object} settings 要保存的设置项对象
 */
export function saveSettings(settings: AppSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch (e) {}
  syncUiLanguageToMain(settings?.uiLanguage)
}

/**
 * 导设置项为 JSON 文件，文件名包含当前日期
 * @param {Object} settings 要导出的设置对象
 */
export async function exportSettings(settings: AppSettings, t: TranslateFn): Promise<void> {
  await downloadJsonExport('settings', settings, t)
}

/**
 * 从 JSON 文件中导入设置项（校验 envelope，未知键静默剥离；非法字段保留 currentSettings）
 * @param {File} file 用户选择的 JSON 文件对象
 * @param {Object} currentSettings 导入前的当前设置
 * @returns {Promise<{ settings: Object, warnings: import('../lib/settings/importWarnings').SettingsImportWarning[] }>}
 */
export function importSettings(
  file: File,
  currentSettings: AppSettings,
): Promise<{ settings: AppSettings; warnings: SettingsImportWarning[] }> {
  return validateAndParseSettingsImport(file, currentSettings)
}

/** 设置对话框三个标签页（labelKey 对应 settings.tabs.*） */
export const SETTINGS_TABS = [
  { key: 'general', labelKey: 'settings.tabs.general' },
  { key: 'ssh-terminal', labelKey: 'settings.tabs.sshTerminal' },
  { key: 'data-security', labelKey: 'settings.tabs.dataSecurity' },
]

/** 各标签内区块顺序（与 SETTINGS_SCHEMA 中 section 字段对应） */
export const SETTINGS_TAB_SECTION_IDS = {
  'general': ['confirm', 'terminal', 'logging', 'appearance'],
  'ssh-terminal': ['algorithm', 'highlight'],
  'data-security': ['credentials', 'sessions', 'settingsMgmt'],
}

/**
 * 设置界面区块与表单项定义（文案由 i18n 解析）
 */
export const SETTINGS_SCHEMA = [
  {
    section: 'confirm',
    items: [
      { key: 'confirmDeleteSession', type: 'boolean' },
      { key: 'confirmDeleteGroup', type: 'boolean' },
      { key: 'deleteGroupWithSessions', type: 'boolean' },
    ],
  },
  {
    section: 'terminal',
    items: [
      { key: 'terminalInteract', type: 'boolean' },
      {
        key: 'terminalScrollback',
        type: 'number',
        min: TERMINAL_SCROLLBACK_MIN,
        max: TERMINAL_SCROLLBACK_MAX,
        step: 500,
      },
    ],
  },
  {
    section: 'logging',
    items: [
      {
        key: 'loggingMode',
        type: 'select',
        options: [
          { value: 'none', labelKey: 'settings.options.loggingModeNone' },
          { value: 'buffer', labelKey: 'settings.options.loggingModeBuffer' },
          { value: 'stream', labelKey: 'settings.options.loggingModeStream' },
        ],
      },
      { key: 'logPath', type: 'path' },
    ],
  },
  {
    section: 'appearance',
    items: [
      {
        key: 'appTheme',
        type: 'select',
        options: [
          { value: 'dark', labelKey: 'settings.options.themeDark' },
          { value: 'light', labelKey: 'settings.options.themeLight' },
          { value: 'auto', labelKey: 'settings.options.themeAuto' },
        ],
      },
      {
        key: 'uiLanguage',
        type: 'select',
        options: [
          { value: 'auto', labelKey: 'settings.options.langAuto' },
          { value: 'zh', labelKey: 'settings.options.langZh' },
          { value: 'en', labelKey: 'settings.options.langEn' },
        ],
      },
    ],
  },
  {
    section: 'algorithm',
    kind: 'algorithm',
    header: {
      labelKey: 'settings.algoTitle',
      descKey: 'settings.algoIntro',
      actions: [{ action: 'resetAlgorithmPreferences', buttonKey: 'settings.resetDefault' }],
    },
  },
  {
    section: 'highlight',
    kind: 'highlight',
    header: {
      labelKey: 'settings.highlightRules',
      descKey: 'settings.highlightDesc',
      actions: [
        { action: 'resetHighlightRules', buttonKey: 'settings.resetRules' },
        { action: 'addHighlightRule', buttonKey: 'settings.addRule' },
      ],
    },
  },
  {
    section: 'credentials',
    items: [
      { key: 'saveSecretsToVault', type: 'boolean' },
      {
        type: 'action',
        action: 'clearVault',
        labelKey: 'settings.clearSecrets',
        descKey: 'settings.clearSecretsDesc',
        buttonKey: 'settings.clear',
        danger: true,
      },
    ],
  },
  {
    section: 'sessions',
    items: [
      {
        type: 'action',
        action: 'exportSessions',
        labelKey: 'settings.exportSessions',
        descKey: 'settings.exportSessionsDesc',
        buttonKey: 'settings.export',
      },
      {
        type: 'action',
        action: 'importSessions',
        labelKey: 'settings.importSessions',
        descKey: 'settings.importSessionsDesc',
        buttonKey: 'settings.import',
        fileInput: 'importSessions',
      },
      {
        type: 'action',
        action: 'clearAllSessions',
        labelKey: 'settings.clearAllSessions',
        descKey: 'settings.clearAllSessionsDesc',
        buttonKey: 'settings.clearAll',
        danger: true,
      },
    ],
  },
  {
    section: 'settingsMgmt',
    items: [
      {
        type: 'action',
        action: 'exportSettings',
        labelKey: 'settings.exportSettings',
        descKey: 'settings.exportSettingsDesc',
        buttonKey: 'settings.export',
      },
      {
        type: 'action',
        action: 'importSettings',
        labelKey: 'settings.importSettings',
        descKey: 'settings.importSettingsDesc',
        buttonKey: 'settings.import',
        fileInput: 'importSettings',
      },
      {
        type: 'action',
        action: 'restoreDefaultSettings',
        labelKey: 'settings.restoreDefaults',
        descKey: 'settings.restoreDefaultsDesc',
        buttonKey: 'settings.restoreDefaultBtn',
        danger: true,
      },
    ],
  },
]
