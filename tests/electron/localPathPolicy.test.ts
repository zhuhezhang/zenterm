import path from 'path'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => path.resolve(`/mock/${name}`),
  },
}))

import {
  parseProcMountsForPolicy,
  validateLocalFilePath,
  validateLogWriteDirectory,
} from '../../electron/lib/localPathPolicy'

/** 各平台下明确不在 mock 用户目录、且不受 Windows 非系统盘整盘放行影响的路径 */
function deniedLocalFilePath(): string {
  if (process.platform === 'win32') {
    const drive = (process.env.SystemDrive || 'C:').replace(/\\$/, '')
    return path.resolve(`${drive}\\Windows\\System32\\config\\SAM`)
  }
  return '/etc/shadow'
}

function deniedLogDirectory(): string {
  if (process.platform === 'win32') {
    const drive = (process.env.SystemDrive || 'C:').replace(/\\$/, '')
    return path.resolve(`${drive}\\Windows\\System32\\config`)
  }
  return '/var/log/zenterm'
}

describe('parseProcMountsForPolicy', () => {
  it('includes block-device mounts except root', () => {
    const content = [
      '/dev/nvme0n1p2 / ext4 rw,relatime 0 0',
      '/dev/nvme0n1p3 /home ext4 rw,relatime 0 0',
      '/dev/sdb1 /mnt/data ext4 rw,relatime 0 0',
      'tmpfs /run tmpfs rw,nosuid,nodev 0 0',
    ].join('\n')
    expect(parseProcMountsForPolicy(content)).toEqual([
      path.resolve('/home'),
      path.resolve('/mnt/data'),
    ])
  })

  it('includes network filesystem mounts', () => {
    const content = 'server:/export /mnt/nfs nfs4 rw 0 0'
    expect(parseProcMountsForPolicy(content)).toEqual([path.resolve('/mnt/nfs')])
  })
})

describe('localPathPolicy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts file under mocked home root', () => {
    const res = validateLocalFilePath(path.resolve('/mock/home/docs/export.json'), 'read')
    expect(res.success).toBe(true)
  })

  it('rejects file outside allowed roots', () => {
    const res = validateLocalFilePath(deniedLocalFilePath(), 'read')
    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.content.error).toBe('sftp.pathErrors.localDirDenied')
  })

  it('accepts log directory under mocked downloads', () => {
    const res = validateLogWriteDirectory(path.resolve('/mock/downloads/zenterm-logs'))
    expect(res.success).toBe(true)
  })

  it('rejects log directory outside allowed roots', () => {
    const res = validateLogWriteDirectory(deniedLogDirectory())
    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.content.error).toBe('sftp.pathErrors.logDirDenied')
  })
})
