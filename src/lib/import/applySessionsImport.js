import { validateAndParseSessionsImport } from './parseSessionsImport.js'
import { mergeImportedSessions } from './mergeImportedSessions.js'
import { formatSessionImportWarnings } from '../session/importWarnings.js'
import { formatImportError } from './handleImportErrors.js'

/**
 * 解析、合并导入会话并吸入 vault 明文敏感字段
 * @param {File} file 导入的 JSON 文件对象
 * @param {Record<string, unknown>[]} savedSessions 现有会话列表
 * @param {(sessions: Record<string, unknown>[]) => Promise<Record<string, unknown>[]>} absorbSecrets 吸入 vault 明文敏感字段
 * @returns {Promise<{ sessions: Record<string, unknown>[], addedCount: number, warnings: import('../session/importWarnings.js').SessionImportWarning[] }>} 导入后的会话列表、新增数量和导入警告列表
 */
export async function applySessionsImport(file, savedSessions, absorbSecrets) {
  const beforeCount = savedSessions.length
  const { sessions: imported, warnings: parseWarnings } = await validateAndParseSessionsImport(file)
  const mergeWarnings = []
  const merged = mergeImportedSessions(savedSessions, imported, mergeWarnings)
  const sessions = await absorbSecrets(merged)
  return {
    sessions,
    addedCount: sessions.length - beforeCount,
    warnings: [...parseWarnings, ...mergeWarnings],
  }
}

/**
 * 报告导入会话结果
 * @param {(key: string, params?: Record<string, string|number>) => string} t 翻译函数
 * @param {{ addedCount: number, warnings: import('../session/importWarnings.js').SessionImportWarning[] }} result 导入结果
 */
export function reportSessionsImportResult(t, { addedCount, warnings }) {
  if (warnings.length) {
    alert(t('settings.importSessionsPartial', {
      n: addedCount,
      details: formatSessionImportWarnings(t, warnings),
    }))
  } else {
    alert(t('settings.importSessionsOk', { n: addedCount }))
  }
}

/**
 * 报告导入会话错误
 * @param {(key: string, params?: Record<string, string|number>) => string} t 翻译函数
 * @param {unknown} err 错误
 */
export function reportSessionsImportError(t, err) {
  alert(t('settings.importFail', { msg: formatImportError(t, err) }))
}

/**
 * 重置 file input，以便可再次选择同一文件
 * @param {Event & { target: HTMLInputElement }} e 事件
 */
export function resetImportFileInput(e) {
  e.target.value = ''
}
