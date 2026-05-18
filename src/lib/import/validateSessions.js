import { createImportError } from './importErrors.js'
import { readImportJson, unwrapExportPayload } from './parseImportFile.js'
import { normalizeImportedSession } from '../session/normalizeImport.js'

const MAX_SESSION_COUNT = 5000

/**
 * @typedef {{ total: number, accepted: number, skipped: number }} ImportSessionStats
 */

/**
 * @param {File} file
 * @returns {Promise<{ sessions: Record<string, unknown>[], stats: ImportSessionStats }>}
 */
export async function validateAndParseSessionsImport(file) {
  const parsed = await readImportJson(file)
  const rows = unwrapExportPayload(parsed, 'sessions')
  if (rows.length > MAX_SESSION_COUNT) {
    throw createImportError('invalidPayload')
  }

  /** @type {Record<string, unknown>[]} */
  const sessions = []
  let skipped = 0

  for (const raw of rows) {
    const result = normalizeImportedSession(raw)
    if (result.ok) {
      sessions.push(result.session)
    } else {
      skipped += 1
    }
  }

  const stats = { total: rows.length, accepted: sessions.length, skipped }
  if (sessions.length === 0) {
    throw createImportError('noValidSessions', { skipped })
  }

  return { sessions, stats }
}
