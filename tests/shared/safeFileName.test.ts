import { describe, it, expect } from 'vitest'
import { INVALID_LABEL_CHARS, hasInvalidLabelChars, safeFileToken, sanitizeLogFileStem } from '../../shared/safeFileName'

describe('INVALID_LABEL_CHARS', () => {
  it('is shared between renderer and main', () => {
    expect(INVALID_LABEL_CHARS.test('a/b')).toBe(true)
  })
})

describe('safeFileName (renderer)', () => {
  it('detects invalid label chars', () => {
    expect(hasInvalidLabelChars('a/b')).toBe(true)
    expect(hasInvalidLabelChars('hello')).toBe(false)
  })

  it('safeFileToken strips invalid chars and spaces', () => {
    expect(safeFileToken('my host')).toBe('my_host')
    expect(safeFileToken('bad/name')).toBe('badname')
  })
})

describe('safeFileName (main)', () => {
  it('sanitizeLogFileStem replaces invalid with underscore', () => {
    expect(sanitizeLogFileStem('bad/name')).toBe('bad_name')
    expect(sanitizeLogFileStem('')).toBe('session')
  })
})
