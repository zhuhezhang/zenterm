import { useState } from 'react'
import {
  SSH_ALGORITHM_OPTION_POOL,
  isWeakSshAlgorithm,
  type AlgorithmCategory,
} from '../../../shared/sshAlgorithmDefaults'
import type { AppSettings } from '@/types/settings'
import type { SettingsAlgorithmSectionDef } from '@/types/settingsUi'
import type { TranslateFn } from '@/types/i18n'
import SettingsSectionHeader from './SettingsSectionHeader'
import type { SettingsActionKey } from '@/types/settingsUi'

export interface SettingsAlgorithmSectionProps {
  sectionDef: SettingsAlgorithmSectionDef
  form: AppSettings
  t: TranslateFn
  algorithmSections: { key: AlgorithmCategory; label: string; desc: string }[]
  settingsActions: Record<SettingsActionKey, () => void | Promise<void>>
  toggleAlgorithmOption: (type: AlgorithmCategory, value: string) => void
  moveAlgorithmOption: (type: AlgorithmCategory, value: string, direction: number) => void
  resetAlgorithmSection: (type: AlgorithmCategory) => void
  showSettingsHoverTip: (e: React.MouseEvent | React.FocusEvent, text: string) => void
  hideSettingsHoverTip: () => void
}

/** 
 * 渲染算法区块
 * @param {Object} sectionDef 算法区块定义对象
 * @returns {React.ReactNode} 渲染后的算法区块 
 */
export default function SettingsAlgorithmSection({
  sectionDef,
  form,
  t,
  algorithmSections,
  settingsActions,
  toggleAlgorithmOption,
  moveAlgorithmOption,
  resetAlgorithmSection,
  showSettingsHoverTip,
  hideSettingsHoverTip,
}: SettingsAlgorithmSectionProps) {
  const [activeAlgoSection, setActiveAlgoSection] = useState('kex')  // 默认选中密钥交换算法类别
  const algoCategory = algorithmSections.find((item) => item.key === activeAlgoSection) || algorithmSections[0]
  const algoKey = algoCategory.key as AlgorithmCategory
  const selected = form.algorithmPreferences?.[algoKey] || []
  const options = SSH_ALGORITHM_OPTION_POOL[algoKey] || []

  return (
    <div className="settings-section">
      <div className="settings-section-title">{t(`settings.sections.${sectionDef.section}`)}</div>
      <div className="settings-items">
        {sectionDef.header ? (
          <SettingsSectionHeader header={sectionDef.header} t={t} settingsActions={settingsActions} />
        ) : null}
        <div className="settings-item">
          <div className="settings-item-info">
            <span className="settings-item-label">{t('settings.algoCategory')}</span>
            <span className="settings-item-desc">{t('settings.algoCategoryDesc')}</span>
          </div>
          <select className="settings-select" value={activeAlgoSection} onChange={(e) => setActiveAlgoSection(e.target.value)}>
            {algorithmSections.map((item) => (
              <option key={item.key} value={item.key}>{item.label}</option>
            ))}
          </select>
        </div>
        <div className="settings-algo-block">
          <div className="settings-algo-desc">
            <div className="settings-item-info">
              <span className="settings-item-desc">{algoCategory.desc}</span>
            </div>
            <button type="button" className="settings-action-btn" onClick={() => resetAlgorithmSection(algoCategory.key)}>
              {t('settings.resetSection')}
            </button>
          </div>
          {selected.map((value, index) => (
            <div key={value} className="settings-algo-row">
              <label className="settings-algo-label">
                <input type="checkbox" checked onChange={() => toggleAlgorithmOption(algoCategory.key, value)} />
                <span>{value}</span>
                {isWeakSshAlgorithm(algoCategory.key, value) && (
                  <span
                    className="settings-algo-weak-badge"
                    onMouseEnter={(e) => showSettingsHoverTip(e, t('settings.weakTip'))}
                    onMouseLeave={hideSettingsHoverTip}
                  >
                    {t('settings.weakBadge')}
                  </span>
                )}
              </label>
              <div className="settings-algo-actions">
                <button className="settings-algo-btn" type="button" disabled={index <= 0} onClick={() => moveAlgorithmOption(algoCategory.key, value, -1)}>↑</button>
                <button className="settings-algo-btn" type="button" disabled={index === selected.length - 1} onClick={() => moveAlgorithmOption(algoCategory.key, value, 1)}>↓</button>
              </div>
            </div>
          ))}
          {options.filter((value) => !selected.includes(value)).map((value) => (
            <div key={value} className="settings-algo-row">
              <label className="settings-algo-label">
                <input type="checkbox" checked={false} onChange={() => toggleAlgorithmOption(algoCategory.key, value)} />
                <span>{value}</span>
                {isWeakSshAlgorithm(algoCategory.key, value) && (
                  <span
                    className="settings-algo-weak-badge"
                    onMouseEnter={(e) => showSettingsHoverTip(e, t('settings.weakTip'))}
                    onMouseLeave={hideSettingsHoverTip}
                  >
                    {t('settings.weakBadge')}
                  </span>
                )}
              </label>
              <div className="settings-algo-actions">
                <button className="settings-algo-btn" type="button" disabled>↑</button>
                <button className="settings-algo-btn" type="button" disabled>↓</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
