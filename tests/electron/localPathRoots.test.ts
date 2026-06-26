import path from 'path'
import { describe, expect, it } from 'vitest'
import { isPathWithinResolvedRoots } from '../../electron/lib/localPathRoots'

describe('isPathWithinResolvedRoots', () => {
  /** 窄根目录：勿含整盘根（如 D:\），否则 Windows 上 /etc/passwd 会落到同盘而被误放行 */
  const narrowRoots = [path.resolve('/home/user')]

  it('accepts path under a root', () => {
    expect(isPathWithinResolvedRoots(path.resolve('/home/user/docs/file.json'), narrowRoots)).toBe(true)
  })

  it('accepts root itself', () => {
    expect(isPathWithinResolvedRoots(path.resolve('/home/user'), narrowRoots)).toBe(true)
  })

  it('rejects path outside roots', () => {
    expect(isPathWithinResolvedRoots(path.resolve('/etc/passwd'), narrowRoots)).toBe(false)
  })

  it('rejects path traversal escape', () => {
    expect(isPathWithinResolvedRoots(path.resolve('/home/user/../etc/passwd'), narrowRoots)).toBe(false)
  })

  it.skipIf(process.platform !== 'win32')('accepts nested path on alternate drive root', () => {
    const driveRoots = [path.resolve('D:\\')]
    expect(isPathWithinResolvedRoots(path.resolve('D:\\data\\out.txt'), driveRoots)).toBe(true)
  })
})
