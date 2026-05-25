import path from 'path'

/**
 * 判断绝对路径是否位于任一允许根目录下（不含 .. 逃逸）
 * @param {string} resolvedPath 已 resolve 的绝对路径
 * @param {string[]} roots 允许根目录列表（绝对路径）
 * @returns {boolean}
 */
export function isPathWithinResolvedRoots(resolvedPath, roots) {
  const normalized = path.resolve(String(resolvedPath))
  for (const root of roots) {
    const base = path.resolve(String(root))
    const rel = path.relative(base, normalized)
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
      return true
    }
  }
  return false
}
