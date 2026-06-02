import { createImportError } from './handleImportErrors'
import { readImportJson, unwrapExportPayload } from './parseImportFile'
import { sanitizeImportedSettings } from '../settings/sanitizeImport'
import { assertImportFilePathAllowed } from './validateImportFilePath'
import type { AppSettings } from '../../types/settings'
import type { SettingsImportWarning } from '../../types/import'

/**
 * 判断是否为纯对象
 * @param {unknown} raw 待判断的对象
 * @returns {boolean} 是否为纯对象
 */
function isPlainObject(raw: unknown): raw is Partial<AppSettings> {
  return raw != null && typeof raw === 'object' && !Array.isArray(raw)
}

/**
 * 验证并解析设置导入文件
 * @param {File} file 导入的 JSON 文件对象
 * @param {Record<string, unknown>} currentSettings 导入前的当前设置
 * @returns {Promise<{ settings: Record<string, unknown>, warnings: import('../settings/importWarnings').SettingsImportWarning[] }>}
 */
export async function validateAndParseSettingsImport(
  file: File,
  currentSettings: AppSettings,
): Promise<{ settings: AppSettings; warnings: SettingsImportWarning[] }> {
  await assertImportFilePathAllowed(file)
  const parsed = await readImportJson(file)
  const data = unwrapExportPayload(parsed, 'settings')
  if (!isPlainObject(data)) {
    throw createImportError('invalidPayload')
  }
  return await sanitizeImportedSettings(data, currentSettings)
}
