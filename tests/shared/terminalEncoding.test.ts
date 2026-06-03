import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TERMINAL_ENCODING,
  normalizeTerminalEncoding,
} from '../../shared/terminalEncoding'
import { encodeUnicodeToTerminalBytes } from '../../electron/lib/terminalEncodingService'
import { decodeIncomingTerminalWire } from '../../src/lib/terminalEncodingService'

describe('normalizeTerminalEncoding', () => {
  it('aliases utf8 and gb2312', () => {
    expect(normalizeTerminalEncoding('utf8')).toBe('utf-8')
    expect(normalizeTerminalEncoding('gb2312')).toBe('gbk')
  })
})

describe('terminal encoding roundtrip', () => {
  it('utf-8 wire decode', () => {
    const wire = Buffer.from('你好', 'utf8').toString('binary')
    expect(decodeIncomingTerminalWire(wire, DEFAULT_TERMINAL_ENCODING)).toBe('你好')
  })

  it('gbk encode on main and decode on renderer', () => {
    const wire = encodeUnicodeToTerminalBytes('测试', 'gbk').toString('binary')
    expect(decodeIncomingTerminalWire(wire, 'gbk')).toBe('测试')
  })
})
