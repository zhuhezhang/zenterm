import { createImportError } from './handleImportErrors.js'
import { readImportJson, unwrapExportPayload } from './parseImportFile.js'
import { sanitizeImportedSettings } from '../settings/sanitizeImport.js'

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
 * @returns {Promise<Record<string, unknown>>} 规范后的设置对象
 */
export async function validateAndParseSettingsImport(file) {
  const parsed = await readImportJson(file)
  const data = unwrapExportPayload(parsed, 'settings')
  if (!isPlainObject(data)) {
    throw createImportError('invalidPayload')
  }
  return sanitizeImportedSettings(/** @type {Record<string, unknown>} */ (data))
}
