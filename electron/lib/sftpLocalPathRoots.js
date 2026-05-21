/**
 * SFTP 本地路径校验（仅 path，无 Electron）。供 Worker 与主进程共用。
 */
import path from 'path'
import { createSftpPathError, SFTP_ERROR, SFTP_PATH_KIND, } from '../../shared/sftpErrorCodes.js'

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
 * 检查给定上传/下载的文件路径是否位于允许的用户根目录范围内
 * @param {string} localPath 本地路径
 * @param {string[]} roots 允许的用户根目录列表
 * @param {string} [kind] SFTP_PATH_KIND 中的值
 * @throws {Error} 如果路径不在允许的用户根目录范围内
 */
export function assertSftpLocalFilePathAllowedForRoots(localPath, roots, kind = SFTP_PATH_KIND.SFTP) {
  const resolved = path.resolve(String(localPath))
  if (!isPathWithinResolvedRoots(resolved, roots)) {
    throw createSftpPathError(SFTP_ERROR.LOCAL_FILE_PATH_DENIED, { kind })
  }
}

/**
 * 检查给定上传/下载文件夹的路径是否位于允许的用户根目录范围内
 * @param {string} localDir 本地目录
 * @param {string[]} roots 允许的用户根目录列表
 * @param {string} [kind] SFTP_PATH_KIND 中的值
 * @throws {Error} 如果路径不在允许的用户根目录范围内
 */
export function assertSftpLocalDirAllowedForRoots(localDir, roots, kind = SFTP_PATH_KIND.SFTP) {
  const resolved = path.resolve(String(localDir))
  if (!isPathWithinResolvedRoots(resolved, roots)) {
    throw createSftpPathError(SFTP_ERROR.LOCAL_DIR_PATH_DENIED, { kind })
  }
}

/**
 * 安全地拼接本地下载路径
 * @param {string} parentDir 父目录
 * @param {string} remoteEntryName 远程文件名
 * @param {string[]} roots 允许的用户根目录列表
 * @param {string} [kind] SFTP_PATH_KIND 中的值
 * @returns {string} 拼接后的本地路径
 */
export function safeJoinLocalDownloadPathForRoots(parentDir, remoteEntryName, roots, kind = SFTP_PATH_KIND.DOWNLOAD) {
  const base = path.resolve(String(parentDir))
  assertSftpLocalDirAllowedForRoots(base, roots, kind)
  const segment = path.basename(String(remoteEntryName))
  if (!segment || segment === '.' || segment === '..') {
    throw createSftpPathError(SFTP_ERROR.INVALID_FILENAME, { kind })
  }
  const out = path.resolve(base, segment)
  assertSftpLocalFilePathAllowedForRoots(out, roots, kind)
  const rel = path.relative(base, out)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw createSftpPathError(SFTP_ERROR.PATH_ESCAPE_TARGET, { kind })
  }
  return out
}
