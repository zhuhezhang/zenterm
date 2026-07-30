import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockUserData = path.join(process.cwd(), '.vitest-mock-known-hosts')

const showMessageBox = vi.fn()

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return mockUserData
      return path.join(mockUserData, name)
    },
  },
  dialog: {
    showMessageBox: (...args: unknown[]) => showMessageBox(...args),
  },
}))

import {
  clearKnownHostsStore,
  clearSessionHostKeyCache,
  verifySshHostKeyTrust,
} from '../../electron/lib/sshKnownHosts'

const HOST = 'example.test'
const PORT = 22
const HP = `${HOST}:${PORT}`
const RAW_KEY = Buffer.from('zenterm-test-host-key')
const FINGERPRINT = crypto.createHash('sha256').update(RAW_KEY).digest('base64')

function storePath() {
  return path.join(mockUserData, 'zenterm-known-hosts.json')
}

function writeStore(data: Record<string, unknown>) {
  fs.mkdirSync(mockUserData, { recursive: true })
  fs.writeFileSync(storePath(), JSON.stringify(data, null, 2), 'utf8')
}

describe('verifySshHostKeyTrust', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearSessionHostKeyCache()
    fs.mkdirSync(mockUserData, { recursive: true })
    try {
      if (fs.existsSync(storePath())) fs.unlinkSync(storePath())
    } catch { /* ignore */ }
  })

  afterEach(() => {
    clearSessionHostKeyCache()
    try {
      if (fs.existsSync(storePath())) fs.unlinkSync(storePath())
    } catch { /* ignore */ }
  })

  it('accepts matching fingerprint from disk store', async () => {
    writeStore({
      [HP]: { sha256: FINGERPRINT, keyType: 'unknown', updatedAt: 1 },
    })

    const ok = await verifySshHostKeyTrust(null, HOST, PORT, RAW_KEY)

    expect(ok).toBe(true)
    expect(showMessageBox).not.toHaveBeenCalled()
  })

  it('prompts and persists when user trusts and saves unknown host', async () => {
    showMessageBox.mockResolvedValue({ response: 2, checkboxChecked: false })

    const ok = await verifySshHostKeyTrust(null, HOST, PORT, RAW_KEY)

    expect(ok).toBe(true)
    expect(showMessageBox).toHaveBeenCalledTimes(1)
    const saved = JSON.parse(fs.readFileSync(storePath(), 'utf8'))
    expect(saved[HP].sha256).toBe(FINGERPRINT)
  })

  it('trusts once in session cache without writing disk', async () => {
    showMessageBox.mockResolvedValue({ response: 1, checkboxChecked: false })

    const ok = await verifySshHostKeyTrust(null, HOST, PORT, RAW_KEY)

    expect(ok).toBe(true)
    expect(fs.existsSync(storePath())).toBe(false)

    showMessageBox.mockClear()
    const okAgain = await verifySshHostKeyTrust(null, HOST, PORT, RAW_KEY)
    expect(okAgain).toBe(true)
    expect(showMessageBox).not.toHaveBeenCalled()
  })

  it('rejects when user cancels unknown host dialog', async () => {
    showMessageBox.mockResolvedValue({ response: 0, checkboxChecked: false })

    const ok = await verifySshHostKeyTrust(null, HOST, PORT, RAW_KEY)

    expect(ok).toBe(false)
    expect(fs.existsSync(storePath())).toBe(false)
  })

  it('rejects fingerprint change when user disconnects', async () => {
    writeStore({
      [HP]: { sha256: 'old-fingerprint', keyType: 'unknown', updatedAt: 1 },
    })
    showMessageBox.mockResolvedValue({ response: 0, checkboxChecked: false })

    const ok = await verifySshHostKeyTrust(null, HOST, PORT, RAW_KEY)

    expect(ok).toBe(false)
    const saved = JSON.parse(fs.readFileSync(storePath(), 'utf8'))
    expect(saved[HP].sha256).toBe('old-fingerprint')
  })

  it('updates store when user trusts new fingerprint after change', async () => {
    writeStore({
      [HP]: { sha256: 'old-fingerprint', keyType: 'unknown', updatedAt: 1 },
    })
    showMessageBox.mockResolvedValue({ response: 2, checkboxChecked: false })

    const ok = await verifySshHostKeyTrust(null, HOST, PORT, RAW_KEY)

    expect(ok).toBe(true)
    const saved = JSON.parse(fs.readFileSync(storePath(), 'utf8'))
    expect(saved[HP].sha256).toBe(FINGERPRINT)
  })
})

describe('clearKnownHostsStore', () => {
  beforeEach(() => {
    fs.mkdirSync(mockUserData, { recursive: true })
    writeStore({ [HP]: { sha256: FINGERPRINT, keyType: 'unknown', updatedAt: 1 } })
  })

  afterEach(() => {
    try {
      if (fs.existsSync(storePath())) fs.unlinkSync(storePath())
    } catch { /* ignore */ }
  })

  it('removes persisted known hosts file', () => {
    expect(fs.existsSync(storePath())).toBe(true)
    clearKnownHostsStore()
    expect(fs.existsSync(storePath())).toBe(false)
  })
})
