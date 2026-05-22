import { APP } from './app.js'
import { CONNECT } from './connect.js'
import { CREDENTIAL } from './credential.js'
import { ERRORS } from './errors.js'
import { SETTINGS } from './settings.js'
import { SFTP } from './sftp.js'
import { SIDEBAR } from './sidebar.js'
import { TABBAR } from './tabbar.js'
import { TERMINAL } from './terminal.js'
import { TITLEBAR } from './titlebar.js'
import { WELCOME } from './welcome.js'

/** 聚合各模块文案；键路径如 settings.title */
const RENDER_MESSAGES = {
  zh: {
    app: APP.zh,
    connect: CONNECT.zh,
    credential: CREDENTIAL.zh,
    errors: ERRORS.zh,
    settings: SETTINGS.zh,
    sftp: SFTP.zh,
    sidebar: SIDEBAR.zh,
    tabbar: TABBAR.zh,
    terminal: TERMINAL.zh,
    titlebar: TITLEBAR.zh,
    welcome: WELCOME.zh,
  },
  en: {
    app: APP.en,
    connect: CONNECT.en,
    credential: CREDENTIAL.en,
    errors: ERRORS.en,
    settings: SETTINGS.en,
    sftp: SFTP.en,
    sidebar: SIDEBAR.en,
    tabbar: TABBAR.en,
    terminal: TERMINAL.en,
    titlebar: TITLEBAR.en,
    welcome: WELCOME.en,
  },
}

/**
 * 翻译文案，根据语言和路径获取翻译后的文案
 * @param {'zh'|'en'} lang 语言
 * @param {string} path 路径(如"zh.titlebar.close")
 * @param {Record<string, string|number>} [params] 参数（如{name: '张三'}）
 * @returns {string} 翻译后的文案
 */
export function translateRender(lang, path, params = {}) {
  const L = lang === 'en' ? 'en' : 'zh'
  const parts = path.split('.')
  let cur = RENDER_MESSAGES[L]
  for (const p of parts) {
    cur = cur?.[p]
  }
  if (typeof cur !== 'string') return path
  // 替换占位符，例如 cur 为 importSessionsOk: '已导入 {n} 个新会话'
  // 那么当传入 params 为 {n: 1} 时，k=n，返回 "已导入 1 个新会话"
  // 若传入 params 为 {m: 1} 时，k=m，返回 "已导入 {m} 个新会话"
  return cur.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? String(params[k]) : `{${k}}`))
}
