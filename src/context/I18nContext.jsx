import { createContext, useContext, useMemo } from 'react'
import { translate } from '../i18n/translations.js'

/** I18n 上下文 */
const I18nContext = createContext({
  lang: 'zh',
  t: (path, params) => translate('zh', path, params),
})

/**
 * I18n 提供者
 * @param {{ language?: string , children: import('react').ReactNode }} props
 * @param {string} props.language 语言
 * @param {import('react').ReactNode} props.children 子组件
 * @returns {React.ReactNode} I18n 提供者
 */
export function I18nProvider({ language, children }) {
  const lang = language === 'en' ? 'en' : 'zh'
  const value = useMemo(
    () => ({
      lang,
      t: (path, params) => translate(lang, path, params),
    }),
    [lang],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/**
 * 使用 I18n 上下文
 * @returns {I18nContext} I18n 上下文
 */
export function useI18n() {
  return useContext(I18nContext)
}
