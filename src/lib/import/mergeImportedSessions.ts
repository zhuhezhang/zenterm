import type { SavedSession } from '../../types/session'
import type { SessionImportWarning } from '../../types/import'
import { pushSessionImportWarning } from '../session/importWarnings'

function isSameLabelAndGroup(a: SavedSession, b: SavedSession): boolean {
  return String(a.label ?? '') === String(b.label ?? '') && String(a.group ?? '').trim() === String(b.group ?? '').trim()
}

export function mergeImportedSessions(
  existing: SavedSession[],
  imported: SavedSession[],
  warnings: SessionImportWarning[],
): SavedSession[] {
  const merged: SavedSession[] = [...existing]
  imported.forEach((s, index) => {
    const oneBased = index + 1
    const savedId = String(s.savedId ?? '')
    const label = String(s.label ?? '')
    const group = String(s.group ?? '').trim()

    if (merged.some((m) => m.savedId === savedId)) {
      pushSessionImportWarning(warnings, 'mergeDuplicateSavedId', {
        index: oneBased,
        savedId,
        label,
      })
      return
    }

    if (merged.some((m) => isSameLabelAndGroup(m, s))) {
      pushSessionImportWarning(warnings, 'mergeDuplicateLabel', {
        index: oneBased,
        savedId,
        label,
        group,
      })
      return
    }

    merged.push(s)
  })

  return merged
}
