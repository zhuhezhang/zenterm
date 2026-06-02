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
    const res = validateLocalFilePath('/etc/shadow', 'read')
    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.content.error).toBe('sftp.pathErrors.localDirDenied')
  })

  it('accepts log directory under mocked downloads', () => {
    const res = validateLogWriteDirectory(path.resolve('/mock/downloads/zterm-logs'))
    expect(res.success).toBe(true)
  })

  it('rejects log directory outside allowed roots', () => {
    const res = validateLogWriteDirectory('/var/log/zterm')
    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.content.error).toBe('sftp.pathErrors.logDirDenied')
  })
})
