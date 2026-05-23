import { describe, it, expect } from 'vitest'
import {
  isIpcErrorCode,
  createIpcError,
  ipcFail,
  ipcErrorFromResponse,
  ipcFailFromThrown,
} from '../../shared/ipcError.js'

describe('isIpcErrorCode', () => {
  it('accepts app/sftp style codes', () => {
    expect(isIpcErrorCode('sftp.noSession')).toBe(true)
    expect(isIpcErrorCode('credentials.encryptionUnavailable')).toBe(true)
  })

  it('rejects library raw messages', () => {
    expect(isIpcErrorCode('connect ECONNREFUSED 127.0.0.1:22')).toBe(false)
    expect(isIpcErrorCode('SFTP 连接失败')).toBe(false)
  })
})

describe('ipcFailFromThrown', () => {
  it('preserves ipcCode and params', () => {
    const e = createIpcError('sftp.pathErrors.localFileDenied', { kind: 'upload' })
    expect(ipcFailFromThrown(e)).toEqual({
      success: false,
      error: 'sftp.pathErrors.localFileDenied',
      errorParams: { kind: 'upload' },
    })
  })

  it('passes through raw message', () => {
    expect(ipcFailFromThrown(new Error('ECONNREFUSED'))).toEqual({
      success: false,
      error: 'ECONNREFUSED',
    })
  })
})

describe('ipcFail', () => {
  it('adds errorKnown and errorParams when present', () => {
    expect(ipcFail('ssh.workerExitUnexpected', { code: 1 })).toEqual({
      success: false,
      error: 'ssh.workerExitUnexpected',
      errorKnown: true,
      errorParams: { code: 1 },
    })
  })
})

describe('ipcErrorFromResponse', () => {
  it('marks unknown errors as false', () => {
    expect(ipcErrorFromResponse({ error: 'ECONNREFUSED', errorKnown: false })).toMatchObject({
      message: 'ECONNREFUSED',
      errorKnown: false,
    })
  })
})
