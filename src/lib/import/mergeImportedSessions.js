import { pushSessionImportWarning } from '../session/importWarnings.js'

/**
 * 名称与分组均相同视为同一会话（分组为空表示未分组）
 * @param {Record<string, unknown>} a 会话A
 * @param {Record<string, unknown>} b 会话B
 * @returns {boolean} 是否相同
 */
function isSameLabelAndGroup(a, b) {
  return String(a.label ?? '') === String(b.label ?? '')
    && String(a.group ?? '').trim() === String(b.group ?? '').trim()
}

/**
 * 将解析后的会话合并进现有列表；重复 savedId、或同分组下重复 label 的条目不加入并记录警告
 * @param {Record<string, unknown>[]} existing 现有会话
 * @param {Record<string, unknown>[]} imported 待合并的导入会话
 * @param {import('../session/importWarnings.js').SessionImportWarning[]} warnings 导入警告列表
 * @returns {Record<string, unknown>[]} 合并后的会话列表
 */
export function mergeImportedSessions(existing, imported, warnings) {
  const merged = [...existing]
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
