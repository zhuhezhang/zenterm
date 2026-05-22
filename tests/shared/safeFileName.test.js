import { describe, it, expect } from 'vitest'
import {
  hasInvalidLabelChars,
  safeFileToken,
  sanitizeLogFileStem,
} from '../../shared/safeFileName.js'

describe('safeFileName', () => {
  it('detects invalid label chars', () => {
    expect(hasInvalidLabelChars('a/b')).toBe(true)
    expect(hasInvalidLabelChars('hello')).toBe(false)
  })

  it('safeFileToken strips invalid chars and spaces', () => {
    expect(safeFileToken('my host')).toBe('my_host')
    expect(safeFileToken('bad/name')).toBe('badname')
  })

  it('sanitizeLogFileStem replaces invalid with underscore', () => {
    expect(sanitizeLogFileStem('bad/name')).toBe('bad_name')
    expect(sanitizeLogFileStem('')).toBe('session')
  })
})
