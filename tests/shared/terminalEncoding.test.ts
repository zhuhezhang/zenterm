import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TERMINAL_ENCODING,
  normalizeTerminalEncoding,
  uint8ArrayFromBinaryWire,
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

  it('uint8ArrayFromBinaryWire matches buffer bytes', () => {
    const buf = Buffer.from([0x41, 0xff, 0x00])
    const wire = buf.toString('binary')
    expect([...uint8ArrayFromBinaryWire(wire)]).toEqual([0x41, 0xff, 0x00])
  })
})
