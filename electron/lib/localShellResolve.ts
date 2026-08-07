/**
 * 本机 Shell 路径解析：默认 shell / cwd，显式路径校验。
 * 供 handlers/local 与单测使用。
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { assertLocalFilePathAllowed } from './localPathPolicy.js'
import { createIpcError, isIpcError } from './ipcResponse.js'

/**
 * 系统默认 Shell 路径
 * @returns 系统默认 Shell 路径
 */
export function defaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || process.env.ComSpec || 'powershell.exe'
  }
  return process.env.SHELL || '/bin/sh'
}

/**
 * 解析并校验 Shell 路径
 * @param shell 用户填写的 Shell（空则系统默认）
 * @returns 可交给 node-pty 的 shell 路径或命令名
 */
export function resolveShell(shell: string): string {
  const pathStr = String(shell ?? '').trim() || defaultShell()
  if (pathStr.includes('\0')) {
    throw createIpcError('local.shellInvalid')
  }
  // 带路径分隔符的显式路径须存在；裸命令名（如 powershell.exe）交给系统 PATH 解析
  if (pathStr.includes('/') || pathStr.includes('\\')) {
    try {
      if (!fs.statSync(pathStr).isFile()) {
        throw createIpcError('local.shellNotFound')
      }
    } catch (e) {
      if (isIpcError(e)) throw e
      throw createIpcError('local.shellNotFound')
    }
  }
  return pathStr
}

/**
 * 解析并校验工作目录
 * @param cwd 用户填写的 cwd（空则用户家目录）
 * @returns 绝对工作目录路径
 */
export function resolveCwd(cwd: string): string {
  const raw = String(cwd ?? '').trim()
  if (!raw) {
    const home = os.homedir()
    if (!home) throw createIpcError('local.cwdInvalid')
    return home
  }
  if (raw.includes('\0')) {
    throw createIpcError('local.cwdInvalid')
  }
  let resolved: string
  try {
    resolved = path.resolve(raw)
    if (!fs.statSync(resolved).isDirectory()) {
      throw createIpcError('local.cwdNotFound')
    }
  } catch (e) {
    if (isIpcError(e)) throw e
    throw createIpcError('local.cwdNotFound')
  }
  try {
    assertLocalFilePathAllowed(resolved, 'cwd')
  } catch (e) {
    if (isIpcError(e)) {
      throw createIpcError('local.cwdDenied')
    }
    throw createIpcError('local.cwdDenied')
  }
  return resolved
}

/**
 * Unix 登录式 shell 参数（bash/zsh 等加 -l）
 * @param shellPath 已解析的 shell 路径或命令名
 * @returns spawn args
 */
export function shellSpawnArgs(shellPath: string): string[] {
  if (process.platform === 'win32') return []
  const base = path.basename(shellPath)
  if (['bash', 'zsh', 'fish', 'sh', 'dash', 'ksh'].includes(base)) {
    return ['-l']
  }
  return []
}

/**
 * 夹取 PTY 行列数
 * @param n 原始值
 * @param fallback 回退
 */
export function clampPtyDim(n: unknown, fallback: number): number {
  const v = typeof n === 'number' ? n : parseInt(String(n ?? ''), 10)
  if (!Number.isFinite(v)) return fallback
  return Math.min(9999, Math.max(1, Math.floor(v)))
}
