import path from 'path'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => path.resolve(`/mock/${name}`),
  },
}))

import { validateLocalFilePath, validateLogWriteDirectory } from '../../electron/lib/localPathPolicy'

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
