import { describe, expect, it } from 'vitest'
import { ipcFail, ipcOk } from '../../electron/lib/ipcResponse'
import { isIpcFailure, isIpcSuccess, ipcErrorFields } from '../../src/lib/ipc/ipcResponse'

describe('IPC round-trip main → renderer', () => {
  it('preserves success payload shape', () => {
    const mainRes = ipcOk({ path: '/tmp/out.txt', ports: [{ path: '/dev/ttyUSB0' }] })
    expect(isIpcSuccess(mainRes)).toBe(true)
    if (!isIpcSuccess(mainRes)) return
    expect(mainRes.content.path).toBe('/tmp/out.txt')
    expect(Array.isArray(mainRes.content.ports)).toBe(true)
  })

  it('preserves known failure with i18n code and params', () => {
    const mainRes = ipcFail('sftp.pathErrors.localDirDenied', true, { kind: 'upload' })
    expect(isIpcFailure(mainRes)).toBe(true)
    const fields = ipcErrorFields(mainRes)
    expect(fields.error).toBe('sftp.pathErrors.localDirDenied')
    expect(fields.errorKnown).toBe(true)
    expect(fields.errorParams).toEqual({ kind: 'upload' })
  })

  it('preserves raw failure message', () => {
    const mainRes = ipcFail('ECONNRESET', false)
    expect(isIpcFailure(mainRes)).toBe(true)
    const fields = ipcErrorFields(mainRes)
    expect(fields.error).toBe('ECONNRESET')
    expect(fields.errorKnown).toBe(false)
  })
})
