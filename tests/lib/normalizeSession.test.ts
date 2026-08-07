import { describe, expect, it } from 'vitest'
import { normalizeImportedSession } from '../../src/lib/session/normalizeSession'

describe('normalizeImportedSession', () => {
  it('rejects non-object input', () => {
    expect(normalizeImportedSession(null)).toEqual({ ok: false, reason: 'notObject' })
  })

  it('rejects invalid session type', () => {
    expect(normalizeImportedSession({ type: 'ftp', host: '1.2.3.4' })).toEqual({ ok: false, reason: 'invalidType' })
  })

  it('rejects ssh session without host', () => {
    expect(normalizeImportedSession({ type: 'ssh', label: 'x' })).toEqual({ ok: false, reason: 'missingHost' })
  })

  it('normalizes minimal ssh session', () => {
    const result = normalizeImportedSession({
      type: 'ssh',
      host: '192.168.1.1',
      label: 'lab',
      port: 2222,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.session.type).toBe('ssh')
    if (result.session.type !== 'ssh') return
    expect(result.session.host).toBe('192.168.1.1')
    expect(result.session.port).toBe(2222)
    expect(result.session.label).toBe('lab')
    expect(result.session.savedId).toMatch(/^saved-/)
  })

  it('defaults invalid port with warning', () => {
    const result = normalizeImportedSession({
      type: 'telnet',
      host: 'example.com',
      port: 99999,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    if (result.session.type !== 'telnet') return
    expect(result.session.port).toBe(65535)
    expect(result.warnings.some(w => w.code === 'fieldDefaulted' && w.params?.field === 'port')).toBe(true)
  })

  it('rejects serial session without path', () => {
    expect(normalizeImportedSession({ type: 'serial', label: 'com' })).toEqual({ ok: false, reason: 'missingPath' })
  })

  it('normalizes local session without required connection fields', () => {
    const result = normalizeImportedSession({
      type: 'local',
      label: 'MyShell',
      shell: 'C:\\Windows\\System32\\cmd.exe',
      cwd: 'D:\\work',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.session.type).toBe('local')
    if (result.session.type !== 'local') return
    expect(result.session.label).toBe('MyShell')
    expect(result.session.shell).toBe('C:\\Windows\\System32\\cmd.exe')
    expect(result.session.cwd).toBe('D:\\work')
  })

  it('defaults local label from shell basename when label empty', () => {
    const result = normalizeImportedSession({
      type: 'local',
      shell: '/bin/zsh',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.session.label).toBe('zsh')
  })
})
