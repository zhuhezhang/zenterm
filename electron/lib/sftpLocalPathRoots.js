/**
 * SFTP 本地路径校验（仅 path，无 Electron）。供 Worker 与主进程共用。
 */
import path from 'path'
import { translateMain } from '../i18n/translateMain.js'

/**
 * 检查给定路径是否位于允许的用户根目录范围内
 * @param {string} resolvedPath 已 path.resolve 的路径
 * @param {string[]} roots 绝对根路径列表
 * @returns {boolean} 是否位于允许的用户根目录范围内
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
 * @param {'download'|'upload'|'sftp'} [kind] 操作类型，用于错误文案前缀
 * @throws {Error} 如果路径不在允许的用户根目录范围内
 */
export function assertSftpLocalFilePathAllowedForRoots(localPath, roots, kind = 'sftp') {
  const resolved = path.resolve(String(localPath))
  if (!isPathWithinResolvedRoots(resolved, roots)) {
    const hint = translateMain('sftp.pathErrors.allowedRootsHint')
    const kindLabel = translateMain(`sftp.pathKind.${kind}`)
    throw new Error(translateMain('sftp.pathErrors.localFileDenied', { hint, kindLabel }))
  }
}

/**
 * 检查给定上传/下载文件夹的路径是否位于允许的用户根目录范围内
 * @param {string} localDir 本地目录
 * @param {string[]} roots 允许的用户根目录列表
 * @param {'download'|'upload'|'sftp'} [kind] 操作类型
 * @throws {Error} 如果路径不在允许的用户根目录范围内
 */
export function assertSftpLocalDirAllowedForRoots(localDir, roots, kind = 'sftp') {
  const resolved = path.resolve(String(localDir))
  if (!isPathWithinResolvedRoots(resolved, roots)) {
    const hint = translateMain('sftp.pathErrors.allowedRootsHint')
    const kindLabel = translateMain(`sftp.pathKind.${kind}`)
    throw new Error(translateMain('sftp.pathErrors.localDirDenied', { hint, kindLabel }))
  }
}

/**
 * 安全地拼接本地下载路径
 * @param {string} parentDir 父目录
 * @param {string} remoteEntryName 远程文件名
 * @param {string[]} roots 允许的用户根目录列表
 * @param {'download'|'upload'|'sftp'} [kind] 操作类型
 * @returns {string} 拼接后的本地路径
 */
export function safeJoinLocalDownloadPathForRoots(parentDir, remoteEntryName, roots, kind = 'download') {
  const base = path.resolve(String(parentDir))
  assertSftpLocalDirAllowedForRoots(base, roots, kind)
  const segment = path.basename(String(remoteEntryName))
  if (!segment || segment === '.' || segment === '..') {
    const kindLabel = translateMain(`sftp.pathKind.${kind}`)
    throw new Error(translateMain('sftp.pathErrors.invalidFilename', { kindLabel }))
  }
  const out = path.resolve(base, segment)
  assertSftpLocalFilePathAllowedForRoots(out, roots, kind)
  const rel = path.relative(base, out)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    const kindLabel = translateMain(`sftp.pathKind.${kind}`)
    throw new Error(translateMain('sftp.pathErrors.pathEscapeTarget', { kindLabel }))
  }
  return out
}
