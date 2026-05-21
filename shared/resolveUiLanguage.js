/**
 * 界面语言解析（渲染进程与主进程共用）
 */

/**
 * 从语言标签列表解析 zh / en
 * @param {string[]} tags 语言标签列表，如 navigator.languages 或 [app.getLocale()]
 * @returns {'zh'|'en'} 解析后的语言
 */
export function detectLangFromLocaleTags(tags) {
  for (const tag of tags) {
    const lower = String(tag || '').toLowerCase()
    if (lower === 'zh' || lower.startsWith('zh-')) return 'zh'
    if (lower === 'en' || lower.startsWith('en-')) return 'en'
  }
  return 'en'
}

/**
 * 从 Chromium / Electron 渲染进程的 navigator 解析界面语言（zh / en）
 * 主进程无 navigator 时返回 en
 * @returns {'zh'|'en'}
 */
function detectSystemUiLang() {
  const candidates = []
  try {
    if (typeof navigator !== 'undefined' && Array.isArray(navigator.languages) && navigator.languages.length) {
      candidates.push(...navigator.languages)
    } else if (typeof navigator !== 'undefined' && navigator.language) {
      candidates.push(navigator.language)
    }
  } catch {
    /* ignore */
  }
  return detectLangFromLocaleTags(candidates)
}

/**
 * 将设置中的 uiLanguage 解析为实际用于文案的 zh / en
 * @param {string|undefined} stored `auto` | `zh` | `en` 设置中的语言
 * @param {'zh'|'en'} [systemLang] `auto` 时使用的系统语言；省略时在渲染进程用 navigator，主进程应显式传入 app.getLocale() 解析结果
 * @returns {'zh'|'en'} 实际用于文案的语言
 */
export function resolveEffectiveUiLanguage(stored, systemLang) {
  if (stored === 'en') return 'en'
  if (stored === 'zh') return 'zh'
  const sys = systemLang ?? detectSystemUiLang()  // ??表示如果 systemLang 为 undefined，则使用 detectSystemUiLang() 解析系统语言（渲染进程用 navigator，主进程应显式传入 app.getLocale() 解析结果）
  return sys === 'zh' ? 'zh' : 'en'
}
