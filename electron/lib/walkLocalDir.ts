import fs from 'fs'
import path from 'path'
import { assertLocalFilePathAllowed } from './localPathPolicy.js'

/** 本地目录遍历结果 */
export interface WalkedLocalFile {
  /** 绝对路径 */
  path: string
  /** 相对所选根目录的路径（始终使用 `/` 分隔） */
  relativePath: string
}

/**
 * 递归遍历目录下的所有文件（跳过无读权限路径）
 * @param rootDir 根目录
 * @returns 文件列表
 */
export function walkLocalDir(rootDir: string, kind = 'read'): WalkedLocalFile[] {
  assertLocalFilePathAllowed(rootDir, kind)
  const stat = fs.statSync(rootDir)
  if (!stat.isDirectory()) return []

  const root = path.resolve(rootDir)
  const results: WalkedLocalFile[] = []

  const walk = (current: string) => {
    for (const name of fs.readdirSync(current)) {
      const abs = path.join(current, name)
      let st: fs.Stats
      try {
        st = fs.statSync(abs)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        walk(abs)
        continue
      }
      if (!st.isFile()) continue
      try {
        assertLocalFilePathAllowed(abs, kind)
        results.push({
          path: abs,
          relativePath: path.relative(root, abs).split(path.sep).join('/'),
        })
      } catch {
        // 跳过策略不允许的文件
      }
    }
  }

  walk(root)
  return results
}
