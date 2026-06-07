import type { TranslateFn } from '../../types/common'
import type { SessionImportWarning } from '../../types/common'
import type { SavedSession } from '../../types/session'
import { validateAndParseSessionsImport } from './parseSessionsImport'
import { mergeImportedSessions } from './mergeImportedSessions'
import { formatSessionImportWarning } from '../session/importWarnings'

/**
 * 应用会话导入
 * @param file 用户选择的 JSON 文件对象
 * @param savedSessions 保存的会话
 * @param absorbSecrets 吸收明文凭据
 * @returns 应用后的会话、添加的会话数量和警告列表
 */
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

/**
 * 报告会话导入结果
 * @param t 翻译函数
 * @param addedCount 添加的会话数量
 * @param warnings 导入警告列表
 */
export function reportSessionsImportResult(
  t: TranslateFn,
  { addedCount, warnings }: { addedCount: number; warnings: SessionImportWarning[] },
): void {
  if (warnings.length) {
    alert(t('settings.importSessionsPartial', {
      n: addedCount,
      details: warnings.map((w) => formatSessionImportWarning(t, w)).join('\n'),
    }))
  } else {
    alert(t('settings.importSessionsOk', { n: addedCount }))
  }
}
