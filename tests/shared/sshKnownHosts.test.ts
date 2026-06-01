import crypto from 'crypto'
import { describe, expect, it } from 'vitest'
import { fingerprintHostKey, knownHostLookupKey } from '../../shared/sshKnownHostsUtils'

describe('sshKnownHosts helpers', () => {
  it('builds lookup key with default port', () => {
    expect(knownHostLookupKey('example.com', undefined)).toBe('example.com:22')
  })

  it('builds lookup key with explicit port', () => {
    expect(knownHostLookupKey(' 10.0.0.1 ', 2222)).toBe('10.0.0.1:2222')
  })

  it('fingerprints host key with sha256 base64', () => {
    const raw = Buffer.from('test-key-material')
    const fp = fingerprintHostKey(raw)
    const expected = crypto.createHash('sha256').update(raw).digest('base64')
    expect(fp).toBe(expected)
  })
})
