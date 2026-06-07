import { useRef, useCallback, type ChangeEvent } from 'react'
import { useI18n } from '@/context/I18nContext'
import { IMPORT_JSON_ACCEPT } from '@/lib/import/constants'
import { applySessionsImport, reportSessionsImportResult } from '@/lib/import/applySessionsImport'
import { reportImportError } from '@/lib/import/handleImportErrors'
import { absorbPlaintextSecretsFromImportedSessions } from '@/store/credentialsBridge'
import type { SavedSession } from '@/types/session'

/**
 * 使用会话导入
 * @param savedSessions 保存的会话
 * @param onUpdateSessions 更新会话回调
 * @returns 文件引用、文件变化处理、触发导入、接受文件类型
 */
export function useSessionsImport(
  savedSessions: SavedSession[],
  onUpdateSessions: (sessions: SavedSession[]) => void,
) {
  const { t } = useI18n()
  const fileRef = useRef<HTMLInputElement | null>(null)

  const handleFileChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {  // 处理文件变化
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
    e.target.value = ''
  }, [savedSessions, onUpdateSessions, t])

  const triggerImport = useCallback(() => {  // 触发导入
    fileRef.current?.click()  // 点击文件输入框
  }, [])

  return { fileRef, handleFileChange, triggerImport, accept: IMPORT_JSON_ACCEPT }
}
