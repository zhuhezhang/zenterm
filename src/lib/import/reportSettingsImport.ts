import { formatSettingsImportWarnings } from '../settings/importWarnings'
import type { SettingsImportWarning } from '../../types/import'
import type { TranslateFn } from '../../types/i18n'
import { formatImportError } from './handleImportErrors'

/**
 * 报告导入设置结果
 * @param {(key: string, params?: Record<string, string|number>) => string} t 翻译函数
 * @param {import('../settings/importWarnings').SettingsImportWarning[]} warnings 导入警告列表
 */
export function reportSettingsImportResult(t: TranslateFn, warnings: SettingsImportWarning[]) {
  if (warnings.length) {
    alert(t('settings.importSettingsPartial', { details: formatSettingsImportWarnings(t, warnings) }))
  } else {
    alert(t('settings.importSettingsOk'))
  }
}

/**
 * 报告导入设置错误
 * @param {(key: string, params?: Record<string, string|number>) => string} t 翻译函数
 * @param {unknown} err 错误
 */
export function reportSettingsImportError(t: TranslateFn, err: unknown) {
  alert(t('settings.importFail', { msg: formatImportError(t, err) }))
}
