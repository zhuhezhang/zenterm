/**
 * 限制可写/可读的本地路径范围，降低渲染进程被滥用时任意读写磁盘的风险。
 * 允许常见用户目录、本应用 userData；Windows 上另允许系统盘以外的整盘路径。
 */
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { createIpcError } from '../../shared/ipcError.js'
import {
  assertSftpLocalDirAllowedForRoots, assertSftpLocalFilePathAllowedForRoots, isPathWithinResolvedRoots,
  safeJoinLocalDownloadPathForRoots,
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

/**
 * 获取 Windows 系统盘根路径（如 C:\），用于排除整盘放行
 * @returns {string} 系统盘根路径
 */
function getWindowsSystemDriveRoot() {
  const fromEnv = process.env.SystemDrive || process.env.systemdrive
  if (fromEnv) {
    const letter = String(fromEnv).replace(/:.*$/, '').trim()
    if (letter) return path.resolve(`${letter}:\\`)
  }
  const windir = process.env.windir || process.env.WINDIR
  if (windir) return path.parse(path.resolve(windir)).root
  return path.resolve('C:\\')
}

/**
 * Windows：枚举已挂载且非系统盘的盘符根（如 D:\、E:\）
 * @returns {string[]} 已挂载且非系统盘的盘符根列表
 */
function collectWindowsNonSystemDriveRoots() {
  if (process.platform !== 'win32') return []
  const systemRoot = getWindowsSystemDriveRoot().toUpperCase()
  const roots = []
  for (let code = 65; code <= 90; code++) {
    const driveRoot = path.resolve(`${String.fromCharCode(code)}:\\`)
    if (driveRoot.toUpperCase() === systemRoot) continue
    try {
      fs.accessSync(driveRoot, fs.constants.F_OK)
      roots.push(driveRoot)
    } catch {
      /* 盘符未挂载或不可访问 */
    }
  }
  return roots
}

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
  for (const driveRoot of collectWindowsNonSystemDriveRoots()) {
    set.add(driveRoot)
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
    throw createIpcError('sftp.pathErrors.logDirDenied', {})
  }
}

/**
 * 校验日志目录是否允许写入（供设置界面等展示提示，不抛错）
 * @param {string} logDir 日志目录（来自设置）
 * @returns {{ ok: true } | { ok: false, error: string, errorParams?: object }} 失败时返回 IPC 错误码
 */
export function validateLogWriteDirectory(logDir) {
  try {
    assertLogWriteDirectoryAllowed(logDir)
    return { ok: true }
  } catch (e) {
    if (e && typeof e === 'object' && e.ipcCode) {
      const out = { ok: false, error: e.ipcCode }
      if (e.ipcParams && Object.keys(e.ipcParams).length) out.errorParams = e.ipcParams
      return out
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * SFTP 上传/下载涉及的本地文件路径（源文件或目标文件）
 * @param {string} localPath 本地路径
 * @param {string} kind 错误前缀，如「下载」「上传」
 */
export function assertSftpLocalFilePathAllowed(localPath, kind = 'sftp') {
  assertSftpLocalFilePathAllowedForRoots(localPath, collectResolvedRoots(), kind)
}

/**
 * SFTP 下载目录等本地目录
 * @param {string} localDir 本地目录
 * @param {string} kind 错误前缀，如「下载」「上传」
 */
export function assertSftpLocalDirAllowed(localDir, kind = 'sftp') {
  assertSftpLocalDirAllowedForRoots(localDir, collectResolvedRoots(), kind)
}

/**
 * 在已校验的父目录下拼接远程条目名，防止 `../` 跳出；并对结果再次做根校验。
 * @param {string} parentDir 已解析的本地父目录
 * @param {string} remoteEntryName 远程文件名（可能含路径分隔符）
 * @param {string} kind 错误前缀，如「下载」「上传」
 * @returns {string} 解析后的本地路径
 */
export function safeJoinLocalDownloadPath(parentDir, remoteEntryName, kind = 'download') {
  return safeJoinLocalDownloadPathForRoots(parentDir, remoteEntryName, collectResolvedRoots(), kind)
}
