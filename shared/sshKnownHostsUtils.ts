import crypto from 'crypto'

export function knownHostLookupKey(host: unknown, port: unknown): string {
  const h = String(host ?? '').trim()
  const p = Number(port) || 22
  return `${h}:${p}`
}

export function fingerprintHostKey(rawKey: Buffer | string): string {
  const buf = Buffer.isBuffer(rawKey) ? rawKey : Buffer.from(rawKey)
  return crypto.createHash('sha256').update(buf).digest('base64')
}
