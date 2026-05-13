/**
 * SFTP 本地路径校验（仅 path，无 Electron）。供 Worker 与主进程共用。
 */
import path from 'path'

/** 与 localPathPolicy 中 ERR_HINT 保持一致 */
export const SFTP_PATH_ERR_HINT =
  '路径须位于用户主目录、文稿/文档、下载、桌面、图片、音乐、影片或本应用用户数据目录下。'

/**
 * 检查给定路径是否位于允许的用户根目录范围内
 * @param {string} resolvedPath 已 path.resolve 的路径
 * @param {string[]} roots 绝对根路径列表
 * @returns {boolean}
 */
export function isPathWithinResolvedRoots(resolvedPath, roots) {
  const target = path.resolve(resolvedPath)
  for (const root of roots) {
    const rel = path.relative(path.resolve(root), target)
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return true
  }
  return false
}

/**
 * 检查给定路径是否位于允许的用户根目录范围内
 * @param {string} localPath 本地路径
 * @param {string[]} roots 允许的用户根目录列表
 * @param {string} [kind] 错误前缀，如「下载」「上传」
 * @throws {Error} 如果路径不在允许的用户根目录范围内
 */
export function assertSftpLocalFilePathAllowedForRoots(localPath, roots, kind = 'SFTP') {
  const resolved = path.resolve(String(localPath))
  if (!isPathWithinResolvedRoots(resolved, roots)) {
    throw new Error(`${kind} 本地路径被拒绝：${SFTP_PATH_ERR_HINT}`)
  }
}

/**
 * 检查给定路径是否位于允许的用户根目录范围内
 * @param {string} localDir 本地目录
 * @param {string[]} roots 允许的用户根目录列表
 * @param {string} [kind] 错误前缀，如「下载」「上传」
 * @throws {Error} 如果路径不在允许的用户根目录范围内
 */
export function assertSftpLocalDirAllowedForRoots(localDir, roots, kind = 'SFTP') {
  const resolved = path.resolve(String(localDir))
  if (!isPathWithinResolvedRoots(resolved, roots)) {
    throw new Error(`${kind} 本地目录被拒绝：${SFTP_PATH_ERR_HINT}`)
  }
}

/**
 * 安全地拼接本地下载路径 
 * @param {string} parentDir 父目录
 * @param {string} remoteEntryName 远程文件名
 * @param {string[]} roots 允许的用户根目录列表
 * @param {string} [kind] 错误前缀，如「下载」「上传」
 * @returns {string} 拼接后的本地路径
 */
export function safeJoinLocalDownloadPathForRoots(parentDir, remoteEntryName, roots, kind = '下载') {
  const base = path.resolve(String(parentDir))
  assertSftpLocalDirAllowedForRoots(base, roots, kind)
  const segment = path.basename(String(remoteEntryName))
  if (!segment || segment === '.' || segment === '..') {
    throw new Error(`${kind}：非法文件名`)
  }
  const out = path.resolve(base, segment)
  assertSftpLocalFilePathAllowedForRoots(out, roots, kind)
  const rel = path.relative(base, out)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`${kind}：路径跳出目标目录`)
  }
  return out
}
