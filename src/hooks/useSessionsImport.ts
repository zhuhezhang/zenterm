import { useRef, useCallback, type ChangeEvent } from 'react'
import { useI18n } from '@/context/I18nContext'
import { IMPORT_JSON_ACCEPT } from '@/lib/import/constants'
import {
  applySessionsImport,
  reportSessionsImportResult,
  resetImportFileInput,
} from '@/lib/import/applySessionsImport'
import { reportImportError } from '@/lib/import/handleImportErrors'
import { absorbPlaintextSecretsFromImportedSessions } from '@/store/credentialsBridge'
import type { SavedSession } from '@/types/session'

export function useSessionsImport(
  savedSessions: SavedSession[],
  onUpdateSessions: (sessions: SavedSession[]) => void,
) {
  const { t } = useI18n()
  const fileRef = useRef<HTMLInputElement | null>(null)

  const handleFileChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await applySessionsImport(
        file,
        savedSessions,
        absorbPlaintextSecretsFromImportedSessions,
      )
      onUpdateSessions(result.sessions)
      reportSessionsImportResult(t, result)
    } catch (err) {
      reportImportError(t, err)
    }
    resetImportFileInput(e)
  }, [savedSessions, onUpdateSessions, t])

  const triggerImport = useCallback(() => {
    fileRef.current?.click()
  }, [])

  return { fileRef, handleFileChange, triggerImport, accept: IMPORT_JSON_ACCEPT }
}
