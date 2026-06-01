import { formatSettingsImportWarnings } from '../settings/importWarnings'
import type { SettingsImportWarning } from '../../types/import'
import type { TranslateFn } from '../../types/i18n'

/**
 * 报告导入设置结果
 * @param t 翻译函数
 * @param warnings 导入警告列表
 */
export function reportSettingsImportResult(t: TranslateFn, warnings: SettingsImportWarning[]) {
  if (warnings.length) {
    alert(t('settings.importSettingsPartial', { details: formatSettingsImportWarnings(t, warnings) }))
  } else {
    alert(t('settings.importSettingsOk'))
  }
}
