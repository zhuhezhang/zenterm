import path from 'path'
import { describe, expect, it } from 'vitest'
import { isPathWithinResolvedRoots } from '../../electron/lib/localPathRoots'

describe('isPathWithinResolvedRoots', () => {
  const roots = [path.resolve('/home/user'), path.resolve('D:\\')]

  it('accepts path under a root', () => {
    expect(isPathWithinResolvedRoots(path.resolve('/home/user/docs/file.json'), roots)).toBe(true)
  })

  it('accepts root itself', () => {
    expect(isPathWithinResolvedRoots(path.resolve('/home/user'), roots)).toBe(true)
  })

  it('rejects path outside roots', () => {
    expect(isPathWithinResolvedRoots(path.resolve('/etc/passwd'), roots)).toBe(false)
  })

  it('rejects path traversal escape', () => {
    expect(isPathWithinResolvedRoots(path.resolve('/home/user/../etc/passwd'), roots)).toBe(false)
  })

  // 跳过非 Windows 平台的测试
  it.skipIf(process.platform !== 'win32')('accepts nested path on alternate drive root', () => {
    expect(isPathWithinResolvedRoots(path.resolve('D:\\data\\out.txt'), roots)).toBe(true)
  })
})
