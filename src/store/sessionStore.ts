import type { TranslateFn } from '../types/i18n'
import type { SavedSession, SessionConfig } from '../types/session'
import { downloadJsonExport } from '../lib/import/downloadJsonExport'
import { pickSessionStorageFields } from '../lib/session/utils'

const STORAGE_KEY = 'zterm_saved_sessions'

export function loadSavedSessions(): SavedSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedSession[]) : []
  } catch {
    return []
  }
}

export function saveSessions(sessions: SavedSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  } catch {
    /* ignore quota / private mode */
  }
}

export function uniqueLabelInGroup(
  sessions: Pick<SavedSession, 'group' | 'label' | 'savedId'>[],
  group: string,
  label: string,
  excludeSavedId?: string,
): string {
  const siblings = sessions.filter(
    (s) => (s.group || '') === (group || '') && s.savedId !== excludeSavedId,
  )
  const used = new Set(siblings.map((s) => s.label))
  if (!used.has(label)) return label
  let i = 1
  while (used.has(`${label}(${i})`)) i++
  return `${label}(${i})`
}

export function ungroupSessionsUnderPath(
  sessions: SavedSession[],
  groupPath: string,
): SavedSession[] {
  const prefix = groupPath + '/'
  const inGroup = (s: SavedSession) =>
    s.group === groupPath || s.group?.startsWith(prefix)
  const ids = new Set(sessions.filter(inGroup).map((s) => s.savedId))
  if (!ids.size) return sessions

  const next = sessions.map((s) => (ids.has(s.savedId) ? { ...s, group: '' } : s))
  for (let i = 0; i < next.length; i++) {
    if (!ids.has(next[i].savedId)) continue
    const label = uniqueLabelInGroup(next, '', next[i].label, next[i].savedId)
    if (label !== next[i].label) next[i] = { ...next[i], label }
  }
  return next
}

export function addSavedSession(
  sessions: SavedSession[],
  config: SessionConfig,
): SavedSession[] {
  const normalized = pickSessionStorageFields(config)
  const now = Date.now()
  const sid =
    config.savedId || `saved-${now}-${Math.random().toString(36).slice(2, 6)}`
  const label = uniqueLabelInGroup(sessions, normalized.group, normalized.label, sid)
  const newSession: SavedSession = { ...normalized, label, savedId: sid, savedAt: now }

  if (config.savedId) {
    return sessions.map((s) =>
      s.savedId === config.savedId ? newSession : s,
    )
  }

  return [...sessions, newSession]
}

export function duplicateSavedSession(
  sessions: SavedSession[],
  savedId: string,
): SavedSession[] {
  const src = sessions.find((s) => s.savedId === savedId)
  if (!src) return sessions
  const now = Date.now()
  const newId = `saved-${now}-${Math.random().toString(36).slice(2, 6)}`
  const label = uniqueLabelInGroup(sessions, src.group, src.label)
  const copy: SavedSession = { ...src, savedId: newId, label, savedAt: now }
  return [...sessions, copy]
}

export function removeSavedSession(
  sessions: SavedSession[],
  savedId: string,
): SavedSession[] {
  return sessions.filter((s) => s.savedId !== savedId)
}

export function reorderSessions(
  sessions: SavedSession[],
  fromId: string,
  toId: string | null | undefined,
  targetGroup?: string,
): SavedSession[] {
  const arr = [...sessions]
  const fromIdx = arr.findIndex((s) => s.savedId === fromId)
  if (fromIdx === -1) return sessions
  const [item] = arr.splice(fromIdx, 1)
  const moved: SavedSession = {
    ...item,
    group: targetGroup !== undefined ? targetGroup : item.group,
  }
  const tmpArr = arr.filter((s) => s.savedId !== fromId)
  moved.label = uniqueLabelInGroup(tmpArr, moved.group, moved.label, moved.savedId)

  if (toId) {
    const toIdx = arr.findIndex((s) => s.savedId === toId)
    arr.splice(toIdx >= 0 ? toIdx : arr.length, 0, moved)
  } else {
    arr.push(moved)
  }
  return arr
}

export async function exportSessions(
  sessions: SavedSession[],
  t: TranslateFn,
): Promise<void> {
  await downloadJsonExport('sessions', sessions, t)
}

const PLACEHOLDER_KEY = '__zterm_group_placeholders__'

export function loadGroupPlaceholders(): string[] {
  try {
    const raw = localStorage.getItem(PLACEHOLDER_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function saveGroupPlaceholders(list: string[]): void {
  try {
    localStorage.setItem(PLACEHOLDER_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

export function addGroupPlaceholder(list: string[], groupName: string): string[] {
  if (list.includes(groupName)) return list
  return [...list, groupName]
}

export function removeGroupPlaceholder(list: string[], groupName: string): string[] {
  return list.filter((g) => g !== groupName)
}

export function prunePlaceholdersForOccupiedGroups(
  sessions: SavedSession[],
  placeholders: string[],
): string[] {
  const occupied = new Set<string>()
  for (const s of sessions) {
    if (s.group) occupied.add(s.group)
  }
  return placeholders.filter((g) => !occupied.has(g))
}

export function vacatedNamedGroupIfEmpty(
  oldGroup: string | undefined,
  nextSessions: SavedSession[],
): string | undefined {
  if (!oldGroup) return undefined
  if (nextSessions.some((s) => (s.group || '') === (oldGroup || ''))) return undefined
  return oldGroup
}

/**
 * 编辑会话后，若原分组已无任何会话则返回该分组路径
 * @param beforeGroup 保存前的分组路径
 * @param newGroup 新分组路径
 * @param nextSessions addSavedSession 之后的列表
 */
export function vacatedGroupIfMoved(
  beforeGroup: string | undefined,
  newGroup: string | undefined,
  nextSessions: SavedSession[],
): string | undefined {
  if (!beforeGroup) return undefined
  if ((beforeGroup || '') === (newGroup || '')) return undefined
  return vacatedNamedGroupIfEmpty(beforeGroup, nextSessions)
}

export function getGroups(
  sessions: SavedSession[],
  placeholders: string[] = [],
): string[] {
  const groups = new Set(placeholders)
  sessions.forEach((s) => {
    if (s.group) groups.add(s.group)
  })
  return Array.from(groups).sort()
}
