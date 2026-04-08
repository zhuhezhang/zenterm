const STORAGE_KEY = 'zterm_saved_sessions'

export function loadSavedSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (e) { return [] }
}

export function saveSessions(sessions) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)) } catch (e) {}
}

// 同一分组内标签名唯一，冲突时自动加数字后缀
export function uniqueLabelInGroup(sessions, group, label, excludeSavedId) {
  const siblings = sessions.filter(s =>
    (s.group || '') === (group || '') &&
    s.savedId !== excludeSavedId
  )
  const used = new Set(siblings.map(s => s.label))
  if (!used.has(label)) return label
  let i = 1
  while (used.has(`${label}(${i})`)) i++
  return `${label}(${i})`
}

export function addSavedSession(sessions, config) {
  const sid = config.savedId || ('saved-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6))
  const label = uniqueLabelInGroup(sessions, config.group, config.label, sid)
  const newSession = { ...config, label, savedId: sid, savedAt: Date.now() }

  // 如果有 savedId，说明是编辑操作，直接替换该会话
  if (config.savedId) {
    const next = sessions.map(s => s.savedId === config.savedId ? newSession : s)
    saveSessions(next)
    return next
  }

  // 新建会话
  const next = [...sessions, newSession]
  saveSessions(next)
  return next
}

export function duplicateSavedSession(sessions, savedId) {
  const src = sessions.find(s => s.savedId === savedId)
  if (!src) return sessions
  const newId = 'saved-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
  const label = uniqueLabelInGroup(sessions, src.group, src.label)
  const copy = { ...src, savedId: newId, label, savedAt: Date.now() }
  const next = [...sessions, copy]
  saveSessions(next)
  return next
}

export function removeSavedSession(sessions, savedId) {
  const next = sessions.filter(s => s.savedId !== savedId)
  saveSessions(next)
  return next
}

export function reorderSessions(sessions, fromId, toId, targetGroup) {
  const arr = [...sessions]
  const fromIdx = arr.findIndex(s => s.savedId === fromId)
  if (fromIdx === -1) return sessions
  const [item] = arr.splice(fromIdx, 1)
  const moved = { ...item, group: targetGroup !== undefined ? targetGroup : item.group }
  // Fix label uniqueness after group change
  const tmpArr = arr.map(s => s.savedId === fromId ? null : s).filter(Boolean)
  moved.label = uniqueLabelInGroup(tmpArr, moved.group, moved.label, moved.savedId)

  if (toId) {
    const toIdx = arr.findIndex(s => s.savedId === toId)
    arr.splice(toIdx >= 0 ? toIdx : arr.length, 0, moved)
  } else {
    arr.push(moved)
  }
  saveSessions(arr)
  return arr
}

export function exportSessions(sessions) {
  const data = JSON.stringify(sessions, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `zterm-sessions-${new Date().toISOString().slice(0,10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function importSessions(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result)
        if (!Array.isArray(imported)) throw new Error('格式错误')
        resolve(imported)
      } catch (err) { reject(err) }
    }
    reader.onerror = reject
    reader.readAsText(file)
  })
}

// 占位分组（空分组，无会话），key=PLACEHOLDER_KEY
const PLACEHOLDER_KEY = '__zterm_group_placeholders__'

export function loadGroupPlaceholders() {
  try {
    const raw = localStorage.getItem(PLACEHOLDER_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveGroupPlaceholders(list) {
  try { localStorage.setItem(PLACEHOLDER_KEY, JSON.stringify(list)) } catch {}
}

export function addGroupPlaceholder(list, groupName) {
  if (list.includes(groupName)) return list
  const next = [...list, groupName]
  saveGroupPlaceholders(next)
  return next
}

export function removeGroupPlaceholder(list, groupName) {
  const next = list.filter(g => g !== groupName)
  saveGroupPlaceholders(next)
  return next
}

export function getGroups(sessions, placeholders = []) {
  const groups = new Set(placeholders)
  sessions.forEach(s => { if (s.group) groups.add(s.group) })
  return Array.from(groups).sort()
}
