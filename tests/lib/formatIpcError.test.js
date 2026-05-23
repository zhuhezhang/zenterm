import { describe, it, expect } from 'vitest'
import { formatIpcError } from '../../src/lib/ipc/formatIpcError.js'
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

  it('returns raw library message as-is', () => {
    expect(formatIpcError(t, 'connect ECONNREFUSED')).toBe('connect ECONNREFUSED')
  })
})
