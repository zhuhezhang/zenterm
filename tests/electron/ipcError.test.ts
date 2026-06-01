import { describe, it, expect } from 'vitest'
import { createIpcError, ipcFail, ipcFailFromThrown, ipcOk } from '../../electron/lib/ipcResponse'

describe('ipcOk', () => {
  it('wraps payload in content', () => {
    expect(ipcOk({ ports: [] })).toEqual({ success: true, content: { ports: [] } })
  })

  it('wraps downloads path', () => {
    expect(ipcOk({ path: '/Downloads' })).toEqual({ success: true, content: { path: '/Downloads' } })
  })
})

describe('ipcFailFromThrown', () => {
  it('preserves ipcCode and params in content', () => {
    const e = createIpcError('sftp.pathErrors.localDirDenied', { kind: 'upload' })
    expect(ipcFailFromThrown(e)).toEqual({
      success: false,
      errorKnown: true,
      content: {
        error: 'sftp.pathErrors.localDirDenied',
        errorParams: { kind: 'upload' },
      },
    })
  })

  it('passes through raw message with errorKnown false', () => {
    expect(ipcFailFromThrown(new Error('ECONNREFUSED'))).toEqual({
      success: false,
      errorKnown: false,
      content: { error: 'ECONNREFUSED' },
    })
  })
})

describe('ipcFail', () => {
  it('adds errorKnown and errorParams in content when present', () => {
    expect(ipcFail('ssh.workerExitUnexpected', true, { code: 1 })).toEqual({
      success: false,
      errorKnown: true,
      content: {
        error: 'ssh.workerExitUnexpected',
        errorParams: { code: 1 },
      },
    })
  })

  it('merges contentExtra', () => {
    expect(ipcFail('app.unauthorized', true, undefined, { ports: [] })).toEqual({
      success: false,
      errorKnown: true,
      content: { error: 'app.unauthorized', ports: [] },
    })
  })

  it('returns raw message with errorKnown false', () => {
    expect(ipcFail('ECONNREFUSED', false, undefined, { ports: [] })).toEqual({
      success: false,
      errorKnown: false,
      content: { error: 'ECONNREFUSED', ports: [] },
    })
  })
})
