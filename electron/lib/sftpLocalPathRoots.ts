import path from 'path'
import { createIpcError } from './ipcResponse.js'
import { INVALID_LABEL_CHARS } from '../../shared/others.js'
import { isPathWithinResolvedRoots } from './localPathRoots.js'

/**
 * 校验 SFTP 本地文件路径是否在允许根目录内
 * @param {string} localPath 本地文件路径
 * @param {string[]} roots 允许根目录
 * @param {string} kind 操作类型（download/upload 等，用于错误文案）
 */
export function assertSftpLocalFilePathAllowedForRoots(localPath: string, roots: string[], kind: string) {
  const resolved = path.resolve(String(localPath))
  if (!isPathWithinResolvedRoots(resolved, roots)) {
    throw createIpcError('sftp.pathErrors.localDirDenied', { kind })
  }
  const base = path.basename(resolved)
  if (!base || base === '.' || base === '..' || INVALID_LABEL_CHARS.test(base)) {
    throw createIpcError('sftp.pathErrors.invalidFilename', { kind })
  }
}

/**
 * 校验 SFTP 本地目录是否在允许根目录内
 * @param {string} localDir 本地目录路径
 * @param {string[]} roots 允许根目录
 * @param {string} kind 操作类型
 */
export function assertSftpLocalDirAllowedForRoots(localDir: string, roots: string[], kind: string) {
  const resolved = path.resolve(String(localDir))
  if (!isPathWithinResolvedRoots(resolved, roots)) {
    throw createIpcError('sftp.pathErrors.localDirDenied', { kind })
  }
}

/**
 * 在下载目录下安全拼接文件名，防止路径逃逸
 * @param {string} localDir 本地目录
 * @param {string} name 远程条目名
 * @param {string[]} roots 允许根目录
 * @param {string} kind 操作类型
 * @returns {string} 拼接后的绝对路径
 */
export function safeJoinLocalDownloadPathForRoots(localDir: string, name: string, roots: string[], kind: string) {
  const base = String(name ?? '')
  if (!base || base === '.' || base === '..' || INVALID_LABEL_CHARS.test(base)) {
    throw createIpcError('sftp.pathErrors.invalidFilename', { kind })
  }
  const localDirResolved = path.resolve(String(localDir))
  const joined = path.resolve(localDirResolved, base)
  const rel = path.relative(localDirResolved, joined)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw createIpcError('sftp.pathErrors.pathEscapeTarget', { kind })
  }
  if (!isPathWithinResolvedRoots(joined, roots)) {
    throw createIpcError('sftp.pathErrors.localDirDenied', { kind })
  }
  return joined
}
