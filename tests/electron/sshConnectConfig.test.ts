import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_ALGORITHM_SELECTION } from '../../shared/sshAlgorithmDefaults'
import { buildSshConnectConfig } from '../../electron/lib/sshConnectConfig'
import type { SshConnectConfig } from '../../shared/zterm-api'

const hostVerifier = vi.fn()

const baseCfg: SshConnectConfig = {
  host: '192.168.1.10',
  port: 2222,
  username: 'admin',
  authType: 'password',
  password: 'secret',
}

describe('buildSshConnectConfig', () => {
  it('builds password auth with defaults', () => {
    const cfg = buildSshConnectConfig(baseCfg, hostVerifier)
    expect(cfg.host).toBe('192.168.1.10')
    expect(cfg.port).toBe(2222)
    expect(cfg.username).toBe('admin')
    expect(cfg.password).toBe('secret')
    expect(cfg.privateKey).toBeUndefined()
    expect(cfg.readyTimeout).toBe(60000)
    expect(cfg.keepaliveInterval).toBe(0)
    expect(cfg.hostVerifier).toBe(hostVerifier)
    expect(cfg.algorithms).toEqual(DEFAULT_ALGORITHM_SELECTION)
  })

  it('defaults port to 22 and disables invalid keepalive', () => {
    const cfg = buildSshConnectConfig(
      { ...baseCfg, port: undefined, sshKeepaliveInterval: -5 },
      hostVerifier,
    )
    expect(cfg.port).toBe(22)
    expect(cfg.keepaliveInterval).toBe(0)
  })

  it('converts keepalive seconds to milliseconds', () => {
    const cfg = buildSshConnectConfig(
      { ...baseCfg, sshKeepaliveInterval: 45 },
      hostVerifier,
    )
    expect(cfg.keepaliveInterval).toBe(45_000)
  })

  it('uses custom non-empty algorithm lists only', () => {
    const cfg = buildSshConnectConfig(
      {
        ...baseCfg,
        algorithms: {
          kex: ['curve25519-sha256'],
          cipher: [],
          hmac: ['hmac-sha2-256'],
        },
      },
      hostVerifier,
    )
    expect(cfg.algorithms).toEqual({
      kex: ['curve25519-sha256'],
      hmac: ['hmac-sha2-256'],
    })
  })

  it('falls back to defaults when algorithms object is empty', () => {
    const cfg = buildSshConnectConfig(
      { ...baseCfg, algorithms: { kex: [], cipher: [] } },
      hostVerifier,
    )
    expect(cfg.algorithms).toEqual(DEFAULT_ALGORITHM_SELECTION)
  })

  it('builds private key auth with optional passphrase', () => {
    const pem = '-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----'
    const cfg = buildSshConnectConfig(
      {
        ...baseCfg,
        authType: 'privateKey',
        password: undefined,
        privateKey: pem,
        passphrase: 'phrase',
      },
      hostVerifier,
    )
    expect(cfg.password).toBeUndefined()
    expect(cfg.privateKey).toBe(pem)
    expect(cfg.passphrase).toBe('phrase')
  })
})
