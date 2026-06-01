import type { ChangeEvent, RefObject } from 'react'
import SettingsSettingItem from './SettingsSettingItem'
import SettingsAlgorithmSection from './SettingsAlgorithmSection'
import SettingsHighlightSection from './SettingsHighlightSection'
import type { AlgorithmCategory } from '@/lib/settings/algorithmCategory'
import type { AppSettings, HighlightRule } from '@/types/settings'
import type {
  SettingsActionKey,
  SettingsGenericSectionDef,
  SettingsSchemaItem,
} from '@/types/settingsUi'
import type { TranslateFn } from '@/types/i18n'

export interface SettingsGenericSectionProps {
  sectionDef: SettingsGenericSectionDef
  form: AppSettings
  t: TranslateFn
  vaultEncryptionAvailable: boolean | null
  algorithmSections: { key: AlgorithmCategory; label: string; desc: string }[]
  set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  settingsActions: Record<SettingsActionKey, () => void | Promise<void>>
  importSessionsRef: RefObject<HTMLInputElement | null>
  importSettingsRef: RefObject<HTMLInputElement | null>
  onImportSessions: (e: ChangeEvent<HTMLInputElement>) => void
  onImportSettings: (e: ChangeEvent<HTMLInputElement>) => void
  onChooseLogPath: () => void
  onResetLogPath: () => void
  toggleAlgorithmOption: (type: AlgorithmCategory, value: string) => void
  moveAlgorithmOption: (type: AlgorithmCategory, value: string, direction: number) => void
  resetAlgorithmSection: (type: AlgorithmCategory) => void
  updateHighlightRule: (id: string, changes: Partial<HighlightRule>) => void
  removeHighlightRule: (id: string) => void
  showSettingsHoverTip: (e: React.MouseEvent | React.FocusEvent, text: string) => void
  hideSettingsHoverTip: () => void
}

/** 
 * 渲染设置区块
 * @param {Object} sectionDef 设置区块定义对象
 * @returns {React.ReactNode} 渲染后的设置区块 
 */
export default function SettingsGenericSection(props: SettingsGenericSectionProps) {
  const { sectionDef, t } = props

  if (sectionDef.kind === 'algorithm') {  // 渲染算法区块
    return (
      <SettingsAlgorithmSection
        sectionDef={sectionDef}
        form={props.form}
        t={t}
        algorithmSections={props.algorithmSections}
        settingsActions={props.settingsActions}
        toggleAlgorithmOption={props.toggleAlgorithmOption}
        moveAlgorithmOption={props.moveAlgorithmOption}
        resetAlgorithmSection={props.resetAlgorithmSection}
        showSettingsHoverTip={props.showSettingsHoverTip}
        hideSettingsHoverTip={props.hideSettingsHoverTip}
      />
    )
  }

  if (sectionDef.kind === 'highlight') {  // 渲染高亮区块
    return (
      <SettingsHighlightSection
        sectionDef={sectionDef}
        form={props.form}
        t={t}
        settingsActions={props.settingsActions}
        updateHighlightRule={props.updateHighlightRule}
        removeHighlightRule={props.removeHighlightRule}
        showSettingsHoverTip={props.showSettingsHoverTip}
        hideSettingsHoverTip={props.hideSettingsHoverTip}
      />
    )
  }

  return (
    <div className="settings-section">
      <div className="settings-section-title">{t(`settings.sections.${sectionDef.section}`)}</div>
      <div className="settings-items">
        {(sectionDef.items || []).map((item) => (
          <SettingsSettingItem
            key={item.key || item.action}
            item={item as SettingsSchemaItem}
            form={props.form}
            t={t}
            vaultEncryptionAvailable={props.vaultEncryptionAvailable}
            set={props.set}
            settingsActions={props.settingsActions}
            importSessionsRef={props.importSessionsRef}
            importSettingsRef={props.importSettingsRef}
            onImportSessions={props.onImportSessions}
            onImportSettings={props.onImportSettings}
            onChooseLogPath={props.onChooseLogPath}
            onResetLogPath={props.onResetLogPath}
            showSettingsHoverTip={props.showSettingsHoverTip}
            hideSettingsHoverTip={props.hideSettingsHoverTip}
          />
        ))}
      </div>
    </div>
  )
}
