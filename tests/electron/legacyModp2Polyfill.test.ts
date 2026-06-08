import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { installLegacyModp2Polyfill } from '../../electron/lib/legacyModp2Polyfill'

describe('installLegacyModp2Polyfill', () => {
  it('modp2 DH group can generate keys after install', () => {
    installLegacyModp2Polyfill()
    const dh = crypto.createDiffieHellmanGroup('modp2')
    expect(dh.generateKeys()).toBeInstanceOf(Buffer)
  })
})
