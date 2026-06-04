import path from 'path'

/**
 * 判断绝对路径是否位于任一允许根目录下（不含 .. 逃逸）
 * @param resolvedPath 绝对路径
 * @param roots 允许根目录列表
 * @returns 是否位于允许根目录下
 */
export function isPathWithinResolvedRoots(resolvedPath: string, roots: string[]): boolean {
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
