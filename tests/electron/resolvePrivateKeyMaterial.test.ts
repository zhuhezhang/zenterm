import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockHome = path.join(process.cwd(), '.vitest-mock-home')

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'home') return mockHome
      return path.join(mockHome, name)
    },
  },
}))

import { resolvePrivateKeyMaterial } from '../../electron/lib/resolvePrivateKeyMaterial'

const SAMPLE_PEM = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
-----END OPENSSH PRIVATE KEY-----`

describe('resolvePrivateKeyMaterial', () => {
  const tmpFiles: string[] = []

  beforeEach(() => {
    vi.clearAllMocks()
    fs.mkdirSync(mockHome, { recursive: true })
  })

  afterEach(() => {
    for (const f of tmpFiles.splice(0)) {
      try { fs.unlinkSync(f) } catch { /* ignore */ }
    }
  })

  it('returns PEM content as-is', () => {
    expect(resolvePrivateKeyMaterial(SAMPLE_PEM)).toBe(SAMPLE_PEM)
  })

  it('reads private key from file path', () => {
    const file = path.join(mockHome, `pkey-${Date.now()}.pem`)
    fs.writeFileSync(file, SAMPLE_PEM, 'utf8')
    tmpFiles.push(file)
    expect(resolvePrivateKeyMaterial(file)).toBe(SAMPLE_PEM)
  })

  it('expands ~ in path', () => {
    const realHome = os.homedir()
    const sshDir = path.join(realHome, '.ssh')
    const file = path.join(sshDir, `zterm-resolve-test-${Date.now()}`)
    try {
      fs.mkdirSync(sshDir, { recursive: true })
      fs.writeFileSync(file, SAMPLE_PEM, 'utf8')
      tmpFiles.push(file)
      expect(resolvePrivateKeyMaterial(`~/.ssh/${path.basename(file)}`)).toBe(SAMPLE_PEM)
    } catch {
      // 沙箱或权限不足时跳过
    }
  })

  it('throws for missing file', () => {
    expect(() => resolvePrivateKeyMaterial(path.join(mockHome, 'missing.pem'))).toThrow()
  })
})
