import { describe, it, expect } from 'vitest'
import {
  unwrapExportPayload,
  buildExportEnvelope,
} from '../../src/lib/import/parseImportFile.ts'
import { EXPORT_ENVELOPE_VERSION } from '../../src/lib/import/constants.ts'

describe('parseImportFile envelope', () => {
  it('buildExportEnvelope wraps data', () => {
    const env = buildExportEnvelope('sessions', [{ id: 1 }])
    expect(env.ztermExport).toBe('sessions')
    expect(env.version).toBe(EXPORT_ENVELOPE_VERSION)
    expect(env.data).toEqual([{ id: 1 }])
  })

  it('unwrapExportPayload accepts sessions array', () => {
    const env = buildExportEnvelope('sessions', [{ label: 'a' }])
    expect(unwrapExportPayload(env, 'sessions')).toEqual([{ label: 'a' }])
  })

  it('unwrapExportPayload rejects wrong kind', () => {
    const env = buildExportEnvelope('settings', { theme: 'dark' })
    expect(() => unwrapExportPayload(env, 'sessions')).toThrow()
  })

  it('unwrapExportPayload rejects bad version', () => {
    const env = { ztermExport: 'sessions', version: 99, data: [] }
    expect(() => unwrapExportPayload(env, 'sessions')).toThrow()
  })
})
