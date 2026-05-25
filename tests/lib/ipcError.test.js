import { describe, it, expect } from 'vitest'
import { ipcErrorFromResponse } from '../../src/lib/ipc/ipcError.js'
import { ipcPathFromResponse } from '../../src/lib/ipc/ipcResponse.js'

describe('ipcPathFromResponse', () => {
  it('reads path from content on success', () => {
    expect(ipcPathFromResponse({ success: true, content: { path: '/Users/x/Downloads' } })).toBe(
      '/Users/x/Downloads',
    )
  })

  it('returns empty when failed or missing', () => {
    expect(ipcPathFromResponse({ success: false, errorKnown: true, content: { error: 'x' } })).toBe('')
  })
})

describe('ipcErrorFromResponse', () => {
  it('reads error fields from content', () => {
    expect(
      ipcErrorFromResponse({
        success: false,
        errorKnown: false,
        content: { error: 'ECONNREFUSED' },
      }),
    ).toMatchObject({
      message: 'ECONNREFUSED',
      errorKnown: false,
    })
  })
})
