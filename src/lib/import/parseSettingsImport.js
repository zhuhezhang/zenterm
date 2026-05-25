import { createImportError } from './handleImportErrors.js'
import { readImportJson, unwrapExportPayload } from './parseImportFile.js'
import { sanitizeImportedSettings } from '../settings/sanitizeImport.js'
import { assertImportFilePathAllowed } from './validateImportFilePath.js'

/**
 * 判断是否为纯对象
 * @param {unknown} raw 待判断的对象
 * @returns {boolean} 是否为纯对象
 */
function isPlainObject(raw) {
  return raw != null && typeof raw === 'object' && !Array.isArray(raw)
}

/**
 * 验证并解析设置导入文件
 * @param {File} file 导入的 JSON 文件对象
 * @param {Record<string, unknown>} currentSettings 导入前的当前设置
 * @returns {Promise<{ settings: Record<string, unknown>, warnings: import('../settings/importWarnings.js').SettingsImportWarning[] }>}
 */
export async function validateAndParseSettingsImport(file, currentSettings) {
  await assertImportFilePathAllowed(file)
  const parsed = await readImportJson(file)
  const data = unwrapExportPayload(parsed, 'settings')
  if (!isPlainObject(data)) {
    throw createImportError('invalidPayload')
  }
  return await sanitizeImportedSettings(
    /** @type {Record<string, unknown>} */ (data),
    currentSettings ?? {},
  )
}
