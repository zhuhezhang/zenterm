import type { ChangeEvent } from 'react'
import type { TranslateFn } from '../../types/i18n'
import type { SessionImportWarning } from '../../types/import'
import type { SavedSession } from '../../types/session'
import { validateAndParseSessionsImport } from './parseSessionsImport'
import { mergeImportedSessions } from './mergeImportedSessions'
import { formatSessionImportWarnings } from '../session/importWarnings'
import { formatImportError } from './handleImportErrors'

export async function applySessionsImport(
  file: File,
  savedSessions: SavedSession[],
  absorbSecrets: (sessions: SavedSession[]) => Promise<SavedSession[]>,
): Promise<{ sessions: SavedSession[]; addedCount: number; warnings: SessionImportWarning[] }> {
  const beforeCount = savedSessions.length
  const { sessions: imported, warnings: parseWarnings } = await validateAndParseSessionsImport(file)
  const mergeWarnings: SessionImportWarning[] = []
  const merged = mergeImportedSessions(savedSessions, imported, mergeWarnings)
  const sessions = await absorbSecrets(merged)
  return {
    sessions,
    addedCount: sessions.length - beforeCount,
    warnings: [...parseWarnings, ...mergeWarnings],
  }
}

export function reportSessionsImportResult(
  t: TranslateFn,
  { addedCount, warnings }: { addedCount: number; warnings: SessionImportWarning[] },
): void {
  if (warnings.length) {
    alert(t('settings.importSessionsPartial', {
      n: addedCount,
      details: formatSessionImportWarnings(t, warnings),
    }))
  } else {
    alert(t('settings.importSessionsOk', { n: addedCount }))
  }
}

export function reportSessionsImportError(t: TranslateFn, err: unknown): void {
  alert(t('settings.importFail', { msg: formatImportError(t, err) }))
}

export function resetImportFileInput(e: ChangeEvent<HTMLInputElement>): void {
  e.target.value = ''
}
