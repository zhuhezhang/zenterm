import { describe, it, expect } from 'vitest'
import { formatIpcError, formatIpcResponseError, formatThrownIpcError } from '../../src/lib/ipc/formatIpcError.js'
import { ipcErrorFromResponse } from '../../shared/ipcError.js'
import { translateRender } from '../../src/i18n/translateRender.js'

describe('formatIpcError', () => {
  const t = (path, params) => translateRender('zh', path, params)

  it('translates IPC code', () => {
    expect(formatIpcError(t, 'sftp.noSession')).toBe('没有活动的 SFTP 会话')
  })

  it('expands path kind params', () => {
    const msg = formatIpcError(t, 'sftp.pathErrors.localFileDenied', { kind: 'download' })
    expect(msg).toContain('下载')
    expect(msg).toContain('路径须位于')
  })
})

describe('formatIpcResponseError', () => {
  const t = (path, params) => translateRender('zh', path, params)

  it('translates when errorKnown is true', () => {
    expect(formatIpcResponseError(t, { error: 'sftp.noSession', errorKnown: true }))
      .toBe('没有活动的 SFTP 会话')
  })

  it('returns raw when errorKnown is false', () => {
    expect(formatIpcResponseError(t, { error: 'connect ECONNREFUSED', errorKnown: false }))
      .toBe('connect ECONNREFUSED')
  })
})

describe('formatThrownIpcError', () => {
  const t = (path, params) => translateRender('zh', path, params)

  it('shows raw when errorKnown is false', () => {
    const e = ipcErrorFromResponse({ error: 'connect ECONNREFUSED', errorKnown: false })
    expect(formatThrownIpcError(t, e)).toBe('connect ECONNREFUSED')
  })

  it('translates IPC code when errorKnown is true', () => {
    const e = ipcErrorFromResponse({ error: 'sftp.noSession', errorKnown: true })
    expect(formatThrownIpcError(t, e)).toBe('没有活动的 SFTP 会话')
  })
})
