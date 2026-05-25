import { describe, it, expect } from 'vitest'
import {
  createIpcError,
  ipcFail,
  ipcErrorFromResponse,
  ipcFailFromThrown,
} from '../../shared/ipcError.js'

describe('ipcFailFromThrown', () => {
  it('preserves ipcCode and params', () => {
    const e = createIpcError('sftp.pathErrors.localFileDenied', { kind: 'upload' })
    expect(ipcFailFromThrown(e)).toEqual({
      success: false,
      error: 'sftp.pathErrors.localFileDenied',
      errorKnown: true,
      errorParams: { kind: 'upload' },
    })
  })

  it('passes through raw message with errorKnown false', () => {
    expect(ipcFailFromThrown(new Error('ECONNREFUSED'))).toEqual({
      success: false,
      error: 'ECONNREFUSED',
      errorKnown: false,
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
