import type { HighlightRule } from '../../types/settings'
import { translateRender } from '../../i18n/translateRender'
import { resolveEffectiveUiLanguage } from '../resolveUiLanguage'

export function createHighlightRuleId(): string {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export function resolveHighlightRuleId(rawId: unknown, usedIds: Set<string>): string {
  const trimmed = typeof rawId === 'string' ? rawId.trim() : ''
  if (trimmed) return trimmed
  for (let i = 0; i < 100; i++) {
    const candidate = createHighlightRuleId()
    if (!usedIds.has(candidate)) return candidate
  }
  return `${createHighlightRuleId()}-${Math.random().toString(36).slice(2, 8)}`
}

export function unnamedHighlightRuleLabel(lang: 'zh' | 'en', n: number): string {
  return translateRender(lang === 'en' ? 'en' : 'zh', 'settings.unnamedRule', { n })
}

export function resolveHighlightRuleName(
  rawName: unknown,
  usedNames: Set<string>,
  lang: 'zh' | 'en',
  startN = 1,
): string {
  const trimmed = String(rawName ?? '').trim()
  if (trimmed) return trimmed

  const locale = lang === 'en' ? 'en' : 'zh'
  for (let n = startN; n < 10000; n++) {
    const candidate = translateRender(locale, 'settings.unnamedRule', { n })
    if (!usedNames.has(candidate)) return candidate
  }
  return `${translateRender(locale, 'settings.unnamedRule', { n: startN })}-${Date.now()}`
}

export function normalizeHighlightRulesForSave(
  rules: HighlightRule[] | null | undefined,
  lang: string,
): HighlightRule[] {
  const effectiveLang = resolveEffectiveUiLanguage(lang)
  const safeList = rules ?? []

  return safeList.map((rule, index) => {
    const trimmed = String(rule?.name ?? '').trim()
    const displayName = trimmed || unnamedHighlightRuleLabel(effectiveLang, index + 1)
    return { ...rule, name: displayName }
  })
}
