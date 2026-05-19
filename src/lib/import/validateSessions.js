import { createImportError } from './handleImportErrors.js'
import { readImportJson, unwrapExportPayload } from './parseImportFile.js'
import { normalizeImportedSession } from '../session/normalizeImport.js'

/** 最大会话数量 */
const MAX_SESSION_COUNT = 5000

/**
 * 验证并解析会话导入文件
 * @param {File} file 导入的 JSON 文件对象
 * @returns {Promise<{ sessions: Record<string, unknown>[], stats: { total: number, accepted: number, skipped: number } }>} 验证并解析会话导入文件的结果
 */
export async function validateAndParseSessionsImport(file) {
  const parsed = await readImportJson(file)
  const rows = unwrapExportPayload(parsed, 'sessions')
  if (rows.length > MAX_SESSION_COUNT) {
    throw createImportError('invalidPayload')
  }

  const sessions = []  // 存储解析后的会话
  let skipped = 0  // 存储跳过的会话数量

  for (const raw of rows) {  // 遍历解析后的会话
    const result = normalizeImportedSession(raw)  // 规范化会话
    if (result.ok) {
      sessions.push(result.session)  // 添加到会话列表
    } else {
      skipped += 1  // 跳过会话
    }
  }

  const stats = { total: rows.length, accepted: sessions.length, skipped }  // 统计会话数量
  if (sessions.length === 0) {  // 如果没有有效的会话，则抛出错误
    throw createImportError('noValidSessions', { skipped })
  }

  return { sessions, stats }  // 返回会话列表和统计结果
}
