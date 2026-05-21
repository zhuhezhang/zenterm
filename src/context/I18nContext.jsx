/**
 * 没有上下文，lang属性只能根据组件一层层往下传，比如<App><SettingsDialog><TerminalPanel>，这样层层传递。
 * 中间组件可能根本不用 language，却不得不接收再转发，很啰嗦。Context 的思路：在树的上层放一个「公共储物柜」，
 * 里面放好 { lang, t }；谁需要就自己打开柜子取，中间层不用传 props，直接用。
 * Context = 通道 / 柜子本身（定义柜子类型 + 默认值）(I18nContext)
 * Provider = 谁在上层往柜子里放了什么(提供者组件)
 * useI18n = 下层谁从柜子里拿什么(使用者组件)
 */
import { createContext, useContext, useMemo } from 'react'
import { translate } from '../i18n/translations.js'
import { resolveEffectiveUiLanguage } from '../../shared/resolveUiLanguage.js'

/** I18n 上下文 */
const I18nContext = createContext({
  lang: 'zh',
  t: (path, params) => translate('zh', path, params),
})

/**
 * I18n 提供者
 * @param {{ language?: string , children: import('react').ReactNode }} props
 * @param {string} props.language `auto` | `zh` | `en` 语言
 * @param {import('react').ReactNode} props.children 子组件，就是包在里面的所有 UI（AppMain、侧边栏、终端等）
 * @returns {React.ReactNode} I18n 提供者组件，用于提供 I18n 上下文，使得子组件可以访问 I18n 上下文
 */
export function I18nProvider({ language, children }) {
  const lang = resolveEffectiveUiLanguage(language)
  const value = useMemo(  // useMemo 在这里只有当语言 lang 变化时才会重新计算 value 的值，否则直接返回缓存的 value。避免不必要的重新计算和渲染
    () => ({
      lang,
      t: (path, params) => translate(lang, path, params),
    }),
    [lang],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>  // I18nContext.Provider 提供者组件，用于提供 I18n 上下文，使得子组件可以访问 I18n 上下文
}

/**
 * 使用 I18n 上下文
 * @returns {I18nContext} I18n 上下文
 */
export function useI18n() {
  return useContext(I18nContext)  // useContext 用于访问 I18n 上下文
}
