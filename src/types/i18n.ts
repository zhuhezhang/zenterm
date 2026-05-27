export type UiLanguage = 'zh' | 'en'

export type TranslateParams = Record<string, string | number>

/** 文案翻译；第二参数可选，与 translateRender 一致 */
export type TranslateFn = (path: string, params?: TranslateParams) => string

export interface I18nContextValue {
  lang: UiLanguage
  t: TranslateFn
}
