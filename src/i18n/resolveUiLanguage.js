/**
 * 从 Chromium / Electron 渲染进程的 navigator 解析界面语言（zh / en）
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
  for (const tag of candidates) {
    const lower = String(tag || '').toLowerCase()
    if (lower === 'zh' || lower.startsWith('zh-')) return 'zh'
    if (lower === 'en' || lower.startsWith('en-')) return 'en'
  }
  return 'en'
}

/**
 * 将设置中的 uiLanguage 解析为实际用于文案的 zh / en
 * @param {string|undefined} stored `auto` | `zh` | `en`
 * @returns {'zh'|'en'}
 */
export function resolveEffectiveUiLanguage(stored) {
  if (stored === 'en') return 'en'
  if (stored === 'zh') return 'zh'
  return detectSystemUiLang()
}
