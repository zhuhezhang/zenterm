import type { SettingsActionKey, SettingsSectionHeaderDef } from '@/types/settingsUi'
import type { TranslateFn } from '@/types/i18n'

/** 
 * 渲染区块标题
 * @param {Object} header 区块标题对象
 * @returns {React.ReactNode} 渲染后的区块标题 
 */
export default function SettingsSectionHeader({
  header,
  t,
  settingsActions,
}: {
  header: SettingsSectionHeaderDef
  t: TranslateFn
  settingsActions: Record<SettingsActionKey, () => void | Promise<void>>
}) {
  if (!header) return null
  const actions = header.actions || []  // 区块标题的操作按钮列表，如 [ { action: 'resetAlgorithmPreferences', buttonKey: 'settings.resetDefault' } ] 即重置算法偏好设置
  return (
    <div className="settings-item">
      <div className="settings-item-info">
        <span className="settings-item-label">{t(header.labelKey)}</span>
        {header.descKey ? <span className="settings-item-desc">{t(header.descKey)}</span> : null}
      </div>
      {actions.length > 1 ? (
        <div className="settings-item-actions">
          {actions.map((act) => (
            <button
              key={act.action}
              type="button"
              className="settings-action-btn"
              onClick={() => settingsActions[act.action]?.()}
            >
              {t(act.buttonKey)}
            </button>
          ))}
        </div>
      ) : actions.length === 1 ? (
        <button
          type="button"
          className="settings-action-btn"
          onClick={() => settingsActions[actions[0].action]?.()}
        >
          {t(actions[0].buttonKey)}
        </button>
      ) : null}
    </div>
  )
}
