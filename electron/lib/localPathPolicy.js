/**
 * 限制可写/可读的本地路径范围，降低渲染进程被滥用时任意读写磁盘的风险。
 * 仅允许位于常见用户目录及本应用 userData 之下。
 */
import path from 'path'
import { app } from 'electron'

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

/** 错误提示文本 */
const ERR_HINT = '路径须位于用户主目录、文稿/文档、下载、桌面、图片、音乐、影片或本应用用户数据目录下。'

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
 * 检查给定路径是否位于允许的用户根目录范围内
 * @param {string} resolvedPath 已 path.resolve 的路径
 * @returns {boolean}
 */
export function isPathWithinAllowedUserRoots(resolvedPath) {
  const target = path.resolve(resolvedPath)  // 解析输入路径为绝对路径，消除相对路径中的 `..` 等特殊部分
  const roots = collectResolvedRoots()  // 获取所有允许的用户根目录列表
  for (const root of roots) {
    const rel = path.relative(root, target)  // 计算 target 相对于 root 的相对路径
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return true  // 如果 rel 是空字符串，说明 target 和 root 是同一个路径；如果 rel 不以 `..` 开头且不是绝对路径，说明 target 位于 root 之下；否则 target 位于 root 之外
  }
  return false
}

/**
 * 校验日志写入目录是否合法，必须位于允许的用户根目录范围内
 * @param {string} logDir 日志目录路径
 * @throws {Error} 如果目录不合法则抛出错误
 * @param {string} logDir 日志根目录（来自设置）
 */
export function assertLogWriteDirectoryAllowed(logDir) {
  const resolved = path.resolve(String(logDir))
  if (!isPathWithinAllowedUserRoots(resolved)) {
    throw new Error(`日志目录被拒绝：${ERR_HINT}`)
  }
}

/**
 * SFTP 上传/下载涉及的本地文件路径（源文件或目标文件）
 * @param {string} localPath
 * @param {string} kind 错误前缀，如「下载」「上传」
 */
export function assertSftpLocalFilePathAllowed(localPath, kind = 'SFTP') {
  const resolved = path.resolve(String(localPath))
  if (!isPathWithinAllowedUserRoots(resolved)) {
    throw new Error(`${kind} 本地路径被拒绝：${ERR_HINT}`)
  }
}

/**
 * SFTP 下载目录等本地目录
 * @param {string} localDir
 * @param {string} kind
 */
export function assertSftpLocalDirAllowed(localDir, kind = 'SFTP') {
  const resolved = path.resolve(String(localDir))
  if (!isPathWithinAllowedUserRoots(resolved)) {
    throw new Error(`${kind} 本地目录被拒绝：${ERR_HINT}`)
  }
}

/**
 * 在已校验的父目录下拼接远程条目名，防止 `../` 跳出；并对结果再次做根校验。
 * @param {string} parentDir 已解析的本地父目录
 * @param {string} remoteEntryName 远程文件名（可能含路径分隔符）
 * @param {string} kind 错误前缀，如「下载」「上传」
 * @returns {string} 解析后的本地路径
 */
export function safeJoinLocalDownloadPath(parentDir, remoteEntryName, kind = '下载') {
  const base = path.resolve(String(parentDir))
  assertSftpLocalDirAllowed(base, kind)
  const segment = path.basename(String(remoteEntryName))
  if (!segment || segment === '.' || segment === '..') {
    throw new Error(`${kind}：非法文件名`)
  }
  const out = path.resolve(base, segment)
  assertSftpLocalFilePathAllowed(out, kind)
  const rel = path.relative(base, out)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`${kind}：路径跳出目标目录`)
  }
  return out
}
