/**
 * 限制可写/可读的本地路径范围，降低渲染进程被滥用时任意读写磁盘的风险。
 * 仅允许位于常见用户目录及本应用 userData 之下。
 */
import path from 'path'
import { app } from 'electron'
import {
  assertSftpLocalDirAllowedForRoots, assertSftpLocalFilePathAllowedForRoots, isPathWithinResolvedRoots,
  safeJoinLocalDownloadPathForRoots, SFTP_PATH_ERR_HINT,
} from './sftpLocalPathRoots.js'

export {
  assertSftpLocalDirAllowedForRoots,
  assertSftpLocalFilePathAllowedForRoots,
  isPathWithinResolvedRoots,
  safeJoinLocalDownloadPathForRoots,
} from './sftpLocalPathRoots.js'

/** 允许的用户目录列表，重复项会被去重 */
const PATH_NAMES = [
  'home',
  'documents',
  'downloads',
  'desktop',
  'userData',
  'music',
  'pictures',
  'videos',
]

/** 错误提示文本（与 SFTP_PATH_ERR_HINT 一致） */
const ERR_HINT = SFTP_PATH_ERR_HINT

/**
 * 收集所有已解析的允许根目录
 * @returns {string[]} 已解析的允许根目录列表，绝对路径且不含重复项
 */
function collectResolvedRoots() {
  const set = new Set()
  for (const name of PATH_NAMES) {
    try {
      const raw = app.getPath(name)
      if (raw) set.add(path.resolve(raw))
    } catch {
      /* ignore */
    }
  }
  return [...set]
}

/**
 * 供主进程在启动 Worker 时注入：当前用户允许作为 SFTP 本地读写的绝对根路径快照。
 * @returns {string[]} 已解析的允许根目录列表，绝对路径且不含重复项
 */
export function getAllowedUserRootPaths() {
  return collectResolvedRoots()
}

/**
 * 检查给定路径是否位于允许的用户根目录范围内
 * @param {string} resolvedPath 已 path.resolve 的路径
 * @returns {boolean}
 */
export function isPathWithinAllowedUserRoots(resolvedPath) {
  return isPathWithinResolvedRoots(resolvedPath, collectResolvedRoots())
}

/**
 * 校验日志写入目录是否合法，必须位于允许的用户根目录范围内
 * @param {string} logDir 日志根目录（来自设置）
 */
export function assertLogWriteDirectoryAllowed(logDir) {
  const resolved = path.resolve(String(logDir))
  if (!isPathWithinAllowedUserRoots(resolved)) {
    throw new Error(`日志目录被拒绝：${ERR_HINT}`)
  }
}

/**
 * 校验日志目录是否允许写入（供设置界面等展示提示，不抛错）
 * @param {string} logDir 日志目录（来自设置）
 * @returns {{ ok: true } | { ok: false, message: string }} 如果日志目录允许写入则返回 { ok: true }，否则返回 { ok: false, message: string }
 */
export function validateLogWriteDirectory(logDir) {
  try {
    assertLogWriteDirectoryAllowed(logDir)
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, message }
  }
}

/**
 * SFTP 上传/下载涉及的本地文件路径（源文件或目标文件）
 * @param {string} localPath
 * @param {string} kind 错误前缀，如「下载」「上传」
 */
export function assertSftpLocalFilePathAllowed(localPath, kind = 'SFTP') {
  assertSftpLocalFilePathAllowedForRoots(localPath, collectResolvedRoots(), kind)
}

/**
 * SFTP 下载目录等本地目录
 * @param {string} localDir
 * @param {string} kind
 */
export function assertSftpLocalDirAllowed(localDir, kind = 'SFTP') {
  assertSftpLocalDirAllowedForRoots(localDir, collectResolvedRoots(), kind)
}

/**
 * 在已校验的父目录下拼接远程条目名，防止 `../` 跳出；并对结果再次做根校验。
 * @param {string} parentDir 已解析的本地父目录
 * @param {string} remoteEntryName 远程文件名（可能含路径分隔符）
 * @param {string} kind 错误前缀，如「下载」「上传」
 * @returns {string} 解析后的本地路径
 */
export function safeJoinLocalDownloadPath(parentDir, remoteEntryName, kind = '下载') {
  return safeJoinLocalDownloadPathForRoots(parentDir, remoteEntryName, collectResolvedRoots(), kind)
}
