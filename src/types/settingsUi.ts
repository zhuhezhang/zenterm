import type { AppSettings } from './settings'

/** 设置对话框标签页 key（与 SETTINGS_TAB_SECTION_IDS 一致） */
export type SettingsTabKey = 'general' | 'ssh-terminal' | 'data-security'

export type SettingsActionKey =
  | 'resetAlgorithmPreferences'
  | 'resetHighlightRules'
  | 'addHighlightRule'
  | 'clearVault'
  | 'exportSessions'
  | 'importSessions'
  | 'clearAllSessions'
  | 'exportSettings'
  | 'importSettings'
  | 'restoreDefaultSettings'

export interface SettingsHoverTip {
  text: string
  x: number
  y: number
}

export interface SettingsSchemaItem {
  key?: keyof AppSettings & string
  action?: SettingsActionKey
  type?: string
  labelKey?: string
  descKey?: string
  buttonKey?: string
  danger?: boolean
  fileInput?: string
  min?: number
  max?: number
  step?: number
  options?: { value: string; labelKey: string }[]
}

export interface SettingsSectionHeaderDef {
  labelKey: string
  descKey?: string
  actions?: { action: SettingsActionKey; buttonKey: string }[]
}

export interface SettingsAlgorithmSectionDef {
  section: string
  header?: SettingsSectionHeaderDef
}

export interface SettingsGenericSectionDef {
  section: string
  kind?: string
  items?: SettingsSchemaItem[]
  header?: SettingsSectionHeaderDef
}
