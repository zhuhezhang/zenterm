import type { SavedSession, SessionConfig } from '../../types/session'
import { addSavedSession, vacatedGroupIfMoved } from '../../store/sessionStore'

/** 计算保存会话后的列表与可能需要恢复的占位分组 */
export function prepareSavedSessionUpdate(
  savedSessions: SavedSession[],
  config: SessionConfig,
  before: SavedSession | null | undefined,
) {
  const next = addSavedSession(savedSessions, config)
  const vacated = vacatedGroupIfMoved(before?.group, config.group, next)
  return { next, vacated }
}
