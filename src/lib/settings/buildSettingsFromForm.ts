import type { AppSettings } from '../../types/settings'
import { normalizeHighlightRulesForSave } from './highlightRules'
import { clampTerminalScrollback, normalizeLoggingMode } from './normalize'

/** 将设置表单转为可持久化的 AppSettings */
export function buildSettingsFromForm(form: AppSettings, msgLang: 'zh' | 'en'): AppSettings {
  return {
    ...form,
    highlightRules: normalizeHighlightRulesForSave(form.highlightRules, msgLang),
    terminalScrollback: clampTerminalScrollback(form.terminalScrollback),
    loggingMode: normalizeLoggingMode(form.loggingMode),
  }
}
