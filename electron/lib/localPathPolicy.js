/**
 * 限制可写/可读的本地路径范围，降低渲染进程被滥用时任意读写磁盘的风险。
 * 允许常见用户目录、本应用 userData；Windows 上另允许系统盘以外的整盘路径。
 */
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { createIpcError, ipcFail, ipcFailRaw, ipcOk } from '../../shared/ipcResponse.js'
import { isPathWithinResolvedRoots } from './localPathRoots.js'

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
export function collectResolvedRoots() {
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
 * 校验日志写入目录是否合法，必须位于允许的用户根目录范围内
 * @param {string} logDir 日志根目录（来自设置）
 */
export function assertLogWriteDirectoryAllowed(logDir) {
  const resolved = path.resolve(String(logDir))
  if (!isPathWithinResolvedRoots(resolved, collectResolvedRoots())) {
    throw createIpcError('sftp.pathErrors.logDirDenied', {})
  }
}

/**
 * 校验日志目录是否允许写入（供设置界面等展示提示，不抛错）
 * @param {string} logDir 日志目录（来自设置）
 * @returns {import('../../shared/ipcResponse.js').IpcOk | import('../../shared/ipcResponse.js').IpcFail}
 */
export function validateLogWriteDirectory(logDir) {
  try {
    assertLogWriteDirectoryAllowed(logDir)
    return ipcOk()
  } catch (e) {
    if (e && typeof e === 'object' && e.ipcCode) {
      return ipcFail(e.ipcCode, e.ipcParams)
    }
    const msg = e instanceof Error ? e.message : String(e)
    return ipcFailRaw(msg)
  }
}

/**
 * 校验本地文件路径是否位于允许根目录内（导入 JSON、保存终端输出等）
 * @param {string} filePath 本地文件绝对路径
 * @param {string} kind IPC 错误 kind 参数（import / saveOutput 等）
 */
export function assertLocalFilePathAllowed(filePath, kind = 'read') {
  const resolved = path.resolve(String(filePath))
  if (!isPathWithinResolvedRoots(resolved, collectResolvedRoots())) {
    throw createIpcError('sftp.pathErrors.localFileDenied', { kind })
  }
}

/**
 * 校验本地文件路径（供渲染进程 IPC 调用，不抛错）
 * @param {string} filePath 本地文件路径
 * @param {string} [kind] 操作类型
 */
export function validateLocalFilePath(filePath, kind = 'read') {
  try {
    assertLocalFilePathAllowed(filePath, kind)
    return ipcOk()
  } catch (e) {
    if (e && typeof e === 'object' && e.ipcCode) {
      return ipcFail(e.ipcCode, e.ipcParams)
    }
    const msg = e instanceof Error ? e.message : String(e)
    return ipcFailRaw(msg)
  }
}
