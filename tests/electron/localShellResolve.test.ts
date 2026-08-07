import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => path.resolve(`/mock/${name}`),
  },
}))

const assertLocalFilePathAllowed = vi.fn()

vi.mock('../../electron/lib/localPathPolicy', () => ({
  assertLocalFilePathAllowed: (...args: unknown[]) => assertLocalFilePathAllowed(...args),
}))

import {
  clampPtyDim,
  defaultShell,
  resolveCwd,
  resolveShell,
  shellSpawnArgs,
} from '../../electron/lib/localShellResolve'
import { isIpcError } from '../../electron/lib/ipcResponse'

describe('defaultShell', () => {
  it('returns a non-empty path', () => {
    expect(defaultShell().length).toBeGreaterThan(0)
  })
})

describe('resolveShell', () => {
  it('empty uses system default', () => {
    expect(resolveShell('')).toBe(defaultShell())
    expect(resolveShell('   ')).toBe(defaultShell())
  })

  it('rejects NUL character', () => {
    try {
      resolveShell('foo\0bar')
      expect.unreachable()
    } catch (e) {
      expect(isIpcError(e)).toBe(true)
      if (isIpcError(e)) expect(e.ipcCode).toBe('local.shellInvalid')
    }
  })

  it('accepts bare command name without verifying file existence', () => {
    expect(resolveShell('powershell.exe')).toBe('powershell.exe')
  })

  it('rejects explicit path that is not a file', () => {
    const dir = os.tmpdir()
    try {
      resolveShell(dir)
      expect.unreachable()
    } catch (e) {
      expect(isIpcError(e)).toBe(true)
      if (isIpcError(e)) expect(e.ipcCode).toBe('local.shellNotFound')
    }
  })

  it('accepts existing executable path', () => {
    if (process.platform !== 'win32') return
    const comspec = process.env.COMSPEC || process.env.ComSpec
    if (!comspec || !fs.existsSync(comspec)) return
    expect(resolveShell(comspec)).toBe(comspec)
  })
})

describe('resolveCwd', () => {
  beforeEach(() => {
    assertLocalFilePathAllowed.mockReset()
    assertLocalFilePathAllowed.mockImplementation(() => {})
  })

  it('empty uses home directory and skips path policy', () => {
    const cwd = resolveCwd('')
    expect(cwd).toBe(os.homedir())
    expect(assertLocalFilePathAllowed).not.toHaveBeenCalled()
  })

  it('rejects NUL character', () => {
    try {
      resolveCwd('C:\\foo\0bar')
      expect.unreachable()
    } catch (e) {
      expect(isIpcError(e)).toBe(true)
      if (isIpcError(e)) expect(e.ipcCode).toBe('local.cwdInvalid')
    }
  })

  it('rejects missing directory', () => {
    try {
      resolveCwd(path.join(os.tmpdir(), `zenterm-no-such-dir-${Date.now()}`))
      expect.unreachable()
    } catch (e) {
      expect(isIpcError(e)).toBe(true)
      if (isIpcError(e)) expect(e.ipcCode).toBe('local.cwdNotFound')
    }
  })

  it('accepts existing directory when policy allows', () => {
    const dir = os.tmpdir()
    const cwd = resolveCwd(dir)
    expect(cwd).toBe(path.resolve(dir))
    expect(assertLocalFilePathAllowed).toHaveBeenCalled()
  })

  it('maps path policy denial to local.cwdDenied', () => {
    assertLocalFilePathAllowed.mockImplementation(() => {
      const err = new Error('denied') as Error & { ipcCode: string; ipcKnown: boolean }
      err.ipcCode = 'sftp.pathErrors.localDirDenied'
      err.ipcKnown = true
      throw err
    })
    try {
      resolveCwd(os.tmpdir())
      expect.unreachable()
    } catch (e) {
      expect(isIpcError(e)).toBe(true)
      if (isIpcError(e)) expect(e.ipcCode).toBe('local.cwdDenied')
    }
  })
})

describe('shellSpawnArgs', () => {
  it('adds -l for common unix shells on non-windows', () => {
    if (process.platform === 'win32') {
      expect(shellSpawnArgs('/bin/bash')).toEqual([])
      return
    }
    expect(shellSpawnArgs('/bin/bash')).toEqual(['-l'])
    expect(shellSpawnArgs('/usr/bin/zsh')).toEqual(['-l'])
    expect(shellSpawnArgs('/usr/local/bin/custom-shell')).toEqual([])
  })
})

describe('clampPtyDim', () => {
  it('clamps to 1..9999 and falls back', () => {
    expect(clampPtyDim(undefined, 80)).toBe(80)
    expect(clampPtyDim(0, 24)).toBe(1)
    expect(clampPtyDim(10000, 24)).toBe(9999)
    expect(clampPtyDim(120, 24)).toBe(120)
  })
})
