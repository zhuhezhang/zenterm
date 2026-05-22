import { app } from 'electron'
import { detectLangFromLocaleTags, resolveEffectiveUiLanguage } from '../../shared/resolveUiLanguage.js'
import { APP } from './app.js'
import { SFTP } from './sftp.js'
import { SSH_KNOWN_HOSTS } from './sshKnownHosts.js'

/** 聚合各模块文案；键路径如 settings.title */
const MAIN_MESSAGES = {
  zh: {
    app: APP.zh,
    sftp: SFTP.zh,
    sshKnownHosts: SSH_KNOWN_HOSTS.zh,
  },
  en: {
    app: APP.en,
    sftp: SFTP.en,
    sshKnownHosts: SSH_KNOWN_HOSTS.en,
  },
}

/** 
 * 存放由渲染进程传过来的语言参数
 * @type {'auto'|'zh'|'en'} 
 */
let storedUiLanguage = 'auto'

/**
 * 设置主进程缓存的界面语言
 * @param {'auto'|'zh'|'en'} value 设置中的语言
 */
export function setStoredUiLanguage(value) {
  const v = String(value ?? 'auto')
  storedUiLanguage = (v === 'zh' || v === 'en' || v === 'auto') ? v : 'auto'  // 如果设置中的语言不是 `auto` | `zh` | `en`，则设置为 `auto`
}

/** 当前设置解析后的界面语言（zh / en），供 Worker 等子线程对齐文案 */
export function getEffectiveUiLanguage() {
  let systemLang = 'en'
  try {
    systemLang = detectLangFromLocaleTags([app.getLocale()])
  } catch {
    /* ignore */
  }
  return resolveEffectiveUiLanguage(storedUiLanguage, systemLang)
}

/**
 * 主进程 i18n 文案查找与占位符替换（支持点路径，如 changed.title）
 * @param {string} path 文案键或点路径
 * @param {Record<string, string|number>} [params] 占位参数
 * @returns {string} 翻译后的文案
 */
export function translateMain(path, params = {}) {
  const L = resolveEffectiveUiLanguage(storedUiLanguage) === 'en' ? 'en' : 'zh'
  const parts = path.split('.')
  let cur = MAIN_MESSAGES[L]
  for (const p of parts) {
    cur = cur?.[p]
  }
  if (typeof cur !== 'string') return path
  return cur.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? String(params[k]) : `{${k}}`))
}
