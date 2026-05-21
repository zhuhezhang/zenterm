import { translate } from '../../i18n/translations.js'
import { resolveEffectiveUiLanguage } from '../../../shared/resolveUiLanguage.js'

/** 与设置界面「新增规则」一致的唯一 id */
export function createHighlightRuleId() {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

/**
 * 解析高亮规则 id：非空字符串则 trim；否则生成不与 usedIds 冲突的新 id
 * @param {unknown} rawId
 * @param {Set<string>} usedIds
 * @returns {string}
 */
export function resolveHighlightRuleId(rawId, usedIds) {
  const trimmed = typeof rawId === 'string' ? rawId.trim() : ''
  if (trimmed) return trimmed
  for (let i = 0; i < 100; i++) {
    const candidate = createHighlightRuleId()
    if (!usedIds.has(candidate)) return candidate
  }
  return `${createHighlightRuleId()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 「未命名规则 n」文案（与设置界面展示一致）
 * @param {'zh'|'en'} lang 语言
 * @param {number} n 规则编号
 * @returns {string} 规则名称
 */
export function unnamedHighlightRuleLabel(lang, n) {
  return translate((lang === 'en' ? 'en' : 'zh'), 'settings.unnamedRule', { n })
}

/**
 * 解析高亮规则显示名：非空则 trim；否则分配不与 usedNames 冲突的「未命名规则 n」
 * @param {unknown} rawName 原始名称
 * @param {Set<string>} usedNames 已占用的名称（trim 后）
 * @param {'zh'|'en'} lang 语言
 * @param {number} [startN] 尝试「未命名规则 n」的起始 n
 * @returns {string} 规则名称
 */
export function resolveHighlightRuleName(rawName, usedNames, lang, startN = 1) {
  const trimmed = String(rawName ?? '').trim()
  if (trimmed) return trimmed

  const locale = (lang === 'en' ? 'en' : 'zh')
  for (let n = startN; n < 10000; n++) {
    const candidate = translate(locale, 'settings.unnamedRule', { n })
    if (!usedNames.has(candidate)) return candidate
  }
  return `${translate(locale, 'settings.unnamedRule', { n: startN })}-${Date.now()}`
}

/**
 * 终端文本高亮规则名称规范化：名称为空则按当前语言设为「未命名规则 n」（与设置界面保存一致）
 * @param {Array<Record<string, unknown>>|null|undefined} rules 规则列表
 * @param {string} lang 语言
 * @returns {Array<Record<string, unknown>>} 规范化后的规则列表
 */
export function normalizeHighlightRulesForSave(rules, lang) {
  const effectiveLang = resolveEffectiveUiLanguage(lang)
  const safeList = rules ?? []

  return safeList.map((rule, index) => {
    const trimmed = String(rule?.name ?? '').trim()
    const displayName = trimmed || unnamedHighlightRuleLabel(effectiveLang, index + 1)
    return { ...rule, name: displayName }
  })
}
