/**
 * 限制可写/可读的本地路径范围，降低渲染进程被滥用时任意读写磁盘的风险。
 * 允许常见用户目录、本应用 userData；Windows 上另允许系统盘以外的整盘路径；
 * Linux/Unix 上另允许根文件系统（/）以外的独立挂载点整盘路径。
 */
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { createIpcError, ipcFail, ipcOk } from './ipcResponse.js'
import { isIpcError } from './ipcResponse.js'
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

/** 非持久化 / 虚拟文件系统，不作为整盘放行根 */
const PSEUDO_FSTYPES = new Set([
  'tmpfs',
  'devtmpfs',
  'proc',
  'sysfs',
  'devpts',
  'cgroup',
  'cgroup2',
  'pstore',
  'bpf',
  'tracefs',
  'debugfs',
  'securityfs',
  'hugetlbfs',
  'mqueue',
  'configfs',
  'fusectl',
  'autofs',
  'binfmt_misc',
  'ramfs',
  'overlay',
  'squashfs',
  'nsfs',
  'efivarfs',
  'rpc_pipefs',
])

/** 网络文件系统类型（无 /dev/ 设备节点时仍放行整挂载点） */
const NETWORK_FSTYPES = new Set(['nfs', 'nfs4', 'cifs', 'smbfs', 'smb3'])

/**
 * 获取 Windows 系统盘根路径（如 C:\），用于排除整盘放行
 * @returns 系统盘根路径
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
 * @returns 非系统盘根路径列表
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
 * 判断是否为持久化挂载设备
 * @param device 设备路径
 * @param fstype 文件系统类型
 * @returns 是否为持久化挂载设备
 */
function isPersistedMountDevice(device: string, fstype: string): boolean {
  if (PSEUDO_FSTYPES.has(fstype)) return false
  if (device.startsWith('/dev/')) return true
  if (NETWORK_FSTYPES.has(fstype)) return true
  if (fstype.startsWith('fuse.') && fstype !== 'fuse.portal') return true
  return false
}

/**
 * 从 /proc/mounts 或 /etc/mtab 内容解析非根（/）的块设备 / 网络挂载点
 * （供 collectUnixNonSystemMountRoots 与单元测试使用）
 * @param content /proc/mounts 或 /etc/mtab 内容
 * @returns 非根（/）的块设备 / 网络挂载点列表
 */
export function parseProcMountsForPolicy(content: string): string[] {
  const systemRoot = path.resolve('/')
  const seen = new Set<string>()
  const roots: string[] = []

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const parts = trimmed.split(/\s+/)
    if (parts.length < 3) continue
    const [device, mountpoint, fstype] = parts
    if (!isPersistedMountDevice(device, fstype)) continue

    const resolved = path.resolve(mountpoint)
    if (resolved === systemRoot) continue
    if (seen.has(resolved)) continue
    seen.add(resolved)
    roots.push(resolved)
  }

  return roots
}

/**
 * macOS：/Volumes 下各卷宗根（外置盘、非系统 APFS 卷等）
 * @returns 卷宗根列表
 */
function collectDarwinVolumeRoots(): string[] {
  const roots: string[] = []
  try {
    for (const name of fs.readdirSync('/Volumes')) {
      if (name.startsWith('.')) continue
      const vol = path.resolve('/Volumes', name)
      try {
        fs.accessSync(vol, fs.constants.F_OK)
        roots.push(vol)
      } catch {
        /* 卷不可访问 */
      }
    }
  } catch {
    /* /Volumes 不可读 */
  }
  return roots
}

/**
 * Linux/Unix：枚举根文件系统（/）以外的独立挂载点根（如 /mnt/data、/media/user/USB）
 * @returns 独立挂载点根列表
 */
function collectUnixNonSystemMountRoots(): string[] {
  if (process.platform === 'win32') return []

  if (process.platform === 'darwin') {
    return collectDarwinVolumeRoots()
  }

  const sources = ['/proc/mounts', '/etc/mtab']
  for (const src of sources) {
    try {
      const content = fs.readFileSync(src, 'utf8')
      const candidates = parseProcMountsForPolicy(content)
      const roots: string[] = []
      for (const mountRoot of candidates) {
        try {
          fs.accessSync(mountRoot, fs.constants.F_OK)
          roots.push(mountRoot)
        } catch {
          /* 挂载点不可访问 */
        }
      }
      return roots
    } catch {
      continue
    }
  }
  return []
}

/**
 * 收集所有已解析的允许根目录
 * @returns 允许根目录列表
 */
export function collectResolvedRoots(): string[] {
  const set = new Set<string>()
  for (const name of PATH_NAMES) {
    try {
      const raw = app.getPath(name as Parameters<typeof app.getPath>[0])
      if (raw) set.add(path.resolve(raw))
    } catch {
      /* ignore */
    }
  }
  for (const driveRoot of collectWindowsNonSystemDriveRoots()) {
    set.add(driveRoot)
  }
  for (const mountRoot of collectUnixNonSystemMountRoots()) {
    set.add(mountRoot)
  }
  return [...set]
}

/**
 * 校验日志写入目录是否合法，必须位于允许的用户根目录范围内
 * @param logDir 日志根目录（来自设置）
 */
export function assertLogWriteDirectoryAllowed(logDir: string) {
  const resolved = path.resolve(String(logDir))
  if (!isPathWithinResolvedRoots(resolved, collectResolvedRoots())) {
    throw createIpcError('sftp.pathErrors.logDirDenied', {})
  }
}

/**
 * 校验日志目录是否允许写入（供设置界面等展示提示，不抛错）
 * @param logDir 日志目录（来自设置）
 * @returns IPC 成功响应或失败响应
 */
export function validateLogWriteDirectory(logDir: string) {
  try {
    assertLogWriteDirectoryAllowed(logDir)
    return ipcOk()
  } catch (e) {
    if (isIpcError(e)) {
      return ipcFail(e.ipcCode, true, e.ipcParams)
    }
    const msg = e instanceof Error ? e.message : String(e)
    return ipcFail(msg, false)
  }
}

/**
 * 校验本地文件路径是否位于允许根目录内（导入 JSON、保存终端输出等）
 * @param filePath 本地文件绝对路径
 * @param kind IPC 错误 kind 参数（import / saveOutput 等）
 */
export function assertLocalFilePathAllowed(filePath: string, kind = 'read') {
  const resolved = path.resolve(String(filePath))
  if (!isPathWithinResolvedRoots(resolved, collectResolvedRoots())) {
    throw createIpcError('sftp.pathErrors.localDirDenied', { kind })
  }
}

/**
 * 校验本地文件路径（供渲染进程 IPC 调用，不抛错）
 * @param filePath 本地文件路径
 * @param kind 操作类型
 * @returns IPC 成功响应或失败响应
 */
export function validateLocalFilePath(filePath: string, kind = 'read') {
  try {
    assertLocalFilePathAllowed(filePath, kind)
    return ipcOk()
  } catch (e) {
    if (isIpcError(e)) {
      return ipcFail(e.ipcCode, true, e.ipcParams)
    }
    const msg = e instanceof Error ? e.message : String(e)
    return ipcFail(msg, false)
  }
}
