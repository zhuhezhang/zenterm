/** 本地存储设置的键名 */
const SETTINGS_KEY = 'zterm_settings'

/** 默认放在系统下载目录下的日志子文件夹名 */
export const LOG_PATH_SUBFOLDER = 'zterm-session-log'

/**
 * 默认日志目录：系统下载目录下的 zterm-session-log（主进程会 mkdir 递归创建）
 * @returns {string}
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
 * @param {{ logPath?: string }} [settings]
 * @returns {string}
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

import {
  DEFAULT_ALGORITHM_PREFERENCES,
  SSH_ALGORITHM_OPTION_POOL,
  isWeakSshAlgorithm,
} from '../../shared/sshAlgorithmDefaults.js'

export { DEFAULT_ALGORITHM_PREFERENCES, SSH_ALGORITHM_OPTION_POOL, isWeakSshAlgorithm }

/** 默认设置项 */
export const DEFAULT_SETTINGS = {
  /** 应用界面主题：dark | light | auto（跟随系统亮暗） */
  appTheme: 'dark',
  /** 界面语言：auto 跟随系统 | zh 简体中文 | en English */
  uiLanguage: 'auto',
  confirmDeleteSession: true,
  confirmDeleteGroup: true,
  deleteGroupWithSessions: false,
  terminalInteract: true,   // 选中复制 + 右键粘贴
  backspaceMode: 'auto',    // 退格键模式：auto / del / bs
  enableLogging: false,
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
    const merged = { ...DEFAULT_SETTINGS, ...saved }
    if (!('logPath' in saved)) merged.logPath = getDefaultLogPath()
    if (!['auto', 'en', 'zh'].includes(merged.uiLanguage)) merged.uiLanguage = 'auto'
    if (!['dark', 'light', 'auto'].includes(merged.appTheme)) merged.appTheme = 'dark'
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
  const data = JSON.stringify(settings, null, 2)  // null, 2 表示美化缩进为 2 个空格，方便文件阅读
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
 * 从 JSON 文件中导入设置项，返回一个 Promise，解析成功则返回设置对象，失败则抛出错误
 * @param {File} file 用户选择的 JSON 文件对象
 * @returns {Promise<Object>} 解析后的设置对象
 */
export function importSettings(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()  // 使用浏览器提供的 FileReader API 来读取用户选中的文件内容
    reader.onload = (e) => {  // 绑定事件：文件读取后触发
      try {
        const imported = JSON.parse(e.target.result)  // e.target.result 是读取到的文本内容，尝试解析为 JSON 对象
        if (typeof imported !== 'object' || imported === null) throw new Error('格式错误')
        resolve(imported)
      } catch (err) { reject(err) }
    }
    reader.onerror = reject
    reader.readAsText(file) // 以文本形式读取文件内容，触发 onload 或 onerror 事件
  })
}

/** 「常规」标签内区块顺序（与 SETTINGS_SCHEMA 中 section 字段对应） */
export const SETTINGS_GENERAL_SECTION_IDS = ['confirm', 'terminal', 'logging', 'appearance']

/** 设置项的定义和描述，用于在设置界面动态生成表单（文案由 i18n 按 section / key 解析） */
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
        key: 'backspaceMode',
        type: 'select',
        options: [
          { value: 'auto', labelKey: 'settings.options.backspaceAuto' },
          { value: 'del', labelKey: 'settings.options.backspaceDel' },
          { value: 'bs', labelKey: 'settings.options.backspaceBs' },
        ],
      },
    ],
  },
  {
    section: 'logging',
    items: [
      { key: 'enableLogging', type: 'boolean' },
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
  }
]
