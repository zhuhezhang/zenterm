import type { AlgorithmPreferences } from '../../shared/sshAlgorithmDefaults'

export type AppTheme = 'dark' | 'light' | 'auto'

export type UiLanguageSetting = 'auto' | 'zh' | 'en'

export type LoggingMode = 'none' | 'stream' | 'buffer'

export interface HighlightRule {
  id: string
  name: string
  enabled: boolean
  useRegex: boolean
  caseSensitive: boolean
  pattern: string
  color: string
}

/** 与 DEFAULT_SETTINGS 对齐的应用设置 */
export interface AppSettings {
  appTheme: AppTheme
  uiLanguage: UiLanguageSetting
  confirmDeleteSession: boolean
  confirmDeleteGroup: boolean
  deleteGroupWithSessions: boolean
  terminalInteract: boolean
  terminalScrollback: number
  loggingMode: LoggingMode
  logPath: string
  highlightRules: HighlightRule[]
  algorithmPreferences: AlgorithmPreferences
  saveSecretsToVault: boolean
  sidebarWidth: number
}
