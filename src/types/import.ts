import type { SavedSession } from './session'

/** 导入/合并流程共用的警告条目 */

export interface ImportWarning {
  code: string
  params?: Record<string, string | number>
}

export type SessionImportWarning = ImportWarning

export type SettingsImportWarning = ImportWarning

/** normalizeImportedSession 的返回类型 */
export type NormalizeImportedSessionResult =
  | { ok: true; session: SavedSession; warnings: SessionImportWarning[] }
  | { ok: false; reason: string }
