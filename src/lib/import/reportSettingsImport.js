import { formatSettingsImportWarnings } from '../settings/importWarnings.js'
import { formatImportError } from './handleImportErrors.js'

/**
 * 报告导入设置结果
 * @param {(key: string, params?: Record<string, string|number>) => string} t 翻译函数
 * @param {import('../settings/importWarnings.js').SettingsImportWarning[]} warnings 导入警告列表
 */
export function reportSettingsImportResult(t, warnings) {
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
export function reportSettingsImportError(t, err) {
  alert(t('settings.importFail', { msg: formatImportError(t, err) }))
}
