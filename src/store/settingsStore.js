import {
  DEFAULT_ALGORITHM_PREFERENCES,
  SSH_ALGORITHM_OPTION_POOL,
  isWeakSshAlgorithm,
} from '../../shared/sshAlgorithmDefaults.js'
import { buildExportEnvelope } from '../lib/import/parseImportFile.js'

/** 本地存储设置的键名 */
const SETTINGS_KEY = 'zterm_settings'
/** 默认放在系统下载目录下的日志子文件夹名 */
export const LOG_PATH_SUBFOLDER = 'zterm-session-log'
export { DEFAULT_ALGORITHM_PREFERENCES, SSH_ALGORITHM_OPTION_POOL, isWeakSshAlgorithm }
/** 主界面左侧会话栏默认宽度（px），与 App 分割条逻辑一致 */
export const DEFAULT_SIDEBAR_WIDTH = 300

/** xterm 滚动缓冲区行数：内置默认与可配置范围上限（xterm 理论更大，此处控制内存与 UI） */
export const TERMINAL_SCROLLBACK_DEFAULT = 20_000
export const TERMINAL_SCROLLBACK_MIN = 0
export const TERMINAL_SCROLLBACK_MAX = 500_000

/**
 * 默认日志目录：系统下载目录下的 zterm-session-log（主进程会 mkdir 递归创建）
 * @returns {string} 默认日志目录
 */
export function getDefaultLogPath() {
  try {
    const base = window?.zterm?.getDownloadsPath?.()
    if (!base || typeof base !== 'string') return ''
    const trimmed = base.replace(/[/\\]+$/, '')
    const sep = trimmed.includes('\\') ? '\\' : '/'
    return `${trimmed}${sep}${LOG_PATH_SUBFOLDER}`
  } catch {
    return ''
  }
}

/**
 * 解析实际用于写入日志的目录：自定义路径优先，否则为默认子目录，再否则退回下载根目录
 * @param {{ logPath?: string }} [settings] 当前应用设置
 * @returns {string} 实际用于写入日志的目录
 */
export function resolveLoggingDirectory(settings) {
  try {
    const custom = settings?.logPath != null ? String(settings.logPath).trim() : ''
    if (custom) return custom
    return getDefaultLogPath() || window?.zterm?.getDownloadsPath?.() || ''
  } catch {
    return ''
  }
}

/**
 * 将侧边栏宽度限制在窗口可用范围内（与主界面分割条 min/max 一致）
 * @param {unknown} width 侧边栏宽度
 * @param {number} [innerWidth] 窗口可用宽度
 * @returns {number} 限制后的侧边栏宽度
 */
export function clampSidebarWidthPx(width, innerWidth = typeof window !== 'undefined' ? window.innerWidth : 1200) {
  const iw = Math.max(320, Math.floor(Number(innerWidth)) || 1200)
  const min = Math.max(80, Math.floor(iw * 0.10))
  const max = Math.floor(iw * 0.90)
  const w = Math.floor(Number(width))
  if (!Number.isFinite(w)) return DEFAULT_SIDEBAR_WIDTH
  return Math.min(max, Math.max(min, w))
}

/**
 * 将用户输入规范为合法滚动行数；无法解析时用内置默认
 * @param {unknown} raw 用户输入的滚动行数
 * @returns {number} 规范后的滚动行数
 */
export function clampTerminalScrollback(raw) {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n)) return TERMINAL_SCROLLBACK_DEFAULT
  if (n < TERMINAL_SCROLLBACK_MIN) return TERMINAL_SCROLLBACK_MIN
  if (n > TERMINAL_SCROLLBACK_MAX) return TERMINAL_SCROLLBACK_MAX
  return n
}

/**
 * 会话日志：none = 关闭；buffer = 与 xterm 屏幕缓冲一致（整文件覆盖）；stream = 下行原始流去 ANSI 后追加
 * @param {unknown} m 用户输入的日志模式
 * @returns {'none'|'stream'|'buffer'} 规范后的日志模式
 */
export function normalizeLoggingMode(m) {
  const v = String(m ?? '').trim().toLowerCase()
  if (v === 'none') return 'none'
  if (v === 'stream') return 'stream'
  return 'buffer'
}

/**
 * 将旧版 enableLogging 并入 loggingMode（删除 enableLogging），并规范 loggingMode
 * @param {Record<string, unknown>} settings 旧版设置对象
 * @returns {Record<string, unknown>} 规范后的设置对象
 */
export function applyLegacyLoggingMigration(settings) {
  if (!settings || typeof settings !== 'object') return settings ?? {}
  const out = { ...settings }
  if ('enableLogging' in out) {
    if (out.enableLogging === true) {
      let mode = normalizeLoggingMode(out.loggingMode)
      if (mode === 'none') mode = 'buffer'
      out.loggingMode = mode
    } else {
      out.loggingMode = 'none'
    }
    delete out.enableLogging
  }
  out.loggingMode = normalizeLoggingMode(out.loggingMode)
  return out
}

/** 默认设置项 */
export const DEFAULT_SETTINGS = {
  /** 应用界面主题：dark | light | auto（跟随系统亮暗） */
  appTheme: 'auto',
  /** 界面语言：auto 跟随系统 | zh 简体中文 | en English */
  uiLanguage: 'auto',
  confirmDeleteSession: true,
  confirmDeleteGroup: true,
  deleteGroupWithSessions: false,
  terminalInteract: true,   // 选中复制 + 右键粘贴
  /** xterm scrollback：仅「视口外」向上保留的历史行数，不含当前可见的 term.rows 行 */
  terminalScrollback: TERMINAL_SCROLLBACK_DEFAULT,
  /** 日志模式：none 关闭；buffer 与屏幕一致；stream 按 PTY 下行流追加（可能与 zsh 重绘所见不一致） */
  loggingMode: 'none',
  logPath: '',
  highlightRules: [
    { id: 'default1_error', name: 'default1_error', enabled: true, useRegex: true, caseSensitive: false, pattern: '(\\berror\\b)|(\\bfailed\\b)|(\\bdenied\\b)|(\\bunauthorized\\b)|(\\bdown\\b)', color: '#f1250e' },
    { id: 'default2_success', name: 'default2_success', enabled: true, useRegex: true, caseSensitive: false, pattern: '(\\bsuccess\\b)|(\\bconnected\\b)|(\\bready\\b)|(\\bok\\b)|(\\bup\\b)', color: '#4ade80' },
    { id: 'default3_warning', name: 'default3_warning', enabled: true, useRegex: true, caseSensitive: false, pattern: '(\\bwarning\\b)|(\\bnotice\\b)|(\\binfo\\b)|(\\bdebug\\b)|(\\bdisabled\\b)', color: '#f1c40f' },
    { id: 'default4_ip', name: 'default4_ip', enabled: true, useRegex: true, caseSensitive: false, pattern: '\\b(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\b', color: '#c717d3' },
  ],
  algorithmPreferences: DEFAULT_ALGORITHM_PREFERENCES,
  /** 为 true 且系统支持加密时，保存 SSH/Telnet 会话会把密码、私钥与 passphrase 等写入主进程 vault（safeStorage），不写入 localStorage */
  saveSecretsToVault: false,
  /** 主界面左侧栏宽度（px）；未写入过 localStorage 的旧数据使用 DEFAULT_SIDEBAR_WIDTH */
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
}

/**
 * 加载设置项，从 localStorage 获取并解析 JSON，如果失败则返回默认设置
 * @returns {Object} 设置项对象
 */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    const saved = raw ? JSON.parse(raw) : {}
    if ('copyOnSelect' in saved || 'rightClickPaste' in saved) {  // 兼容旧版 copyOnSelect / rightClickPaste，新版本统一为 terminalInteract
      saved.terminalInteract = !!(saved.copyOnSelect ?? saved.rightClickPaste ?? true)  // !!(...) 把结果强制转换成布尔值；?? 是空值合并运算符，表示如果 copyOnSelect 不为 null 或 undefined 则使用它，否则使用 rightClickPaste，如果 rightClickPaste 也不为 null 或 undefined 则使用它，否则默认 true  
      delete saved.copyOnSelect
      delete saved.rightClickPaste
    }
    if (saved.algorithmPreferences && typeof saved.algorithmPreferences === 'object') {
      saved.algorithmPreferences = {
        ...DEFAULT_ALGORITHM_PREFERENCES,
        ...saved.algorithmPreferences,
      }
    }
    let merged = { ...DEFAULT_SETTINGS, ...saved }
    merged.terminalScrollback = clampTerminalScrollback(merged.terminalScrollback)
    merged = applyLegacyLoggingMigration(merged)
    if (!('logPath' in saved)) merged.logPath = getDefaultLogPath()
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
export function saveSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch (e) {}
}

/**
 * 导设置项为 JSON 文件，文件名包含当前日期
 * @param {Object} settings 要导出的设置对象
 */
export function exportSettings(settings) {
  const payload = buildExportEnvelope('settings', settings)
  const data = JSON.stringify(payload, null, 2)  // null, 2 表示美化缩进为 2 个空格，方便文件阅读
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)  // 生成一个本地可访问的临时 URL，指向这个内存中的文件内容
  const a = document.createElement('a')  // 创建一个隐藏的 <a> 元素，用于触发下载
  a.href = url
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  a.download = `zterm-settings-${date}-${hh}${mm}${ss}.json`
  a.click()  // 程序性地"点击"这个链接，启动浏览器下载流程
  URL.revokeObjectURL(url)  // 释放创建的临时 URL，避免内存泄漏
}

/**
 * 从 JSON 文件中导入设置项（校验 envelope，未知键静默剥离）
 * @param {File} file 用户选择的 JSON 文件对象
 * @returns {Promise<Object>} 规范后的设置对象
 */
export function importSettings(file) {
  return import('../lib/import/validateSettings.js').then((m) => m.validateAndParseSettingsImport(file))
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

/** SSH 算法子类别（与 settings.algo.* i18n 及 algorithmPreferences 键对应） */
export const SSH_ALGORITHM_SECTION_KEYS = ['kex', 'serverHostKey', 'cipher', 'hmac', 'compress']

/**
 * 设置界面区块与表单项定义（文案由 i18n 解析）
 * - 【常规】标签：section 为 confirm、terminal、logging、appearance，即操作确认区块、终端行为区块、日志区块和外观与语言区块
 * - 【SSH 与终端】标签：section 为 algorithm、highlight，即算法区块和高亮区块
 * - 【数据与安全】标签：section 为 credentials、sessions、settingsMgmt，即凭据存储区块、会话管理区块和设置管理区块
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
