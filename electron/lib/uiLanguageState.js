/**
 * 主进程缓存的界面语言（由渲染进程 settings.uiLanguage 同步）
 */
import { app } from 'electron'
import { detectLangFromLocaleTags, resolveEffectiveUiLanguage } from '../../shared/resolveUiLanguage.js'

/** @type {'auto'|'zh'|'en'} */
let storedUiLanguage = 'auto'

/**
 * 设置主进程缓存的界面语言
 * @param {unknown} value 设置中的语言
 */
export function setStoredUiLanguage(value) {
  const v = String(value ?? 'auto')
  storedUiLanguage = (v === 'zh' || v === 'en' || v === 'auto') ? v : 'auto'
}

/** 返回实际用于文案的界面语言 */
export function getEffectiveUiLanguage() {
  const systemLang = detectLangFromLocaleTags([app.getLocale()])
  return resolveEffectiveUiLanguage(storedUiLanguage, systemLang)
}
