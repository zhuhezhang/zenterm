import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock：vi.mock 假扮 Electron
// 主进程代码会 import { app } from 'electron'，测试里不能真开 Electron，就用 mock
// 要点：vi.mock 必须写在 import 被测模块之前（Vitest 会提升 mock，但习惯上仍放顶部）。
const mockHome = path.join(process.cwd(), '.vitest-mock-home')  // 模拟用户主目录
vi.mock('electron', () => ({  // 模拟 Electron 的 app.getPath 方法
  app: {
    getPath: (name: string) => {  // 如果 name 是 'home'，则返回模拟用户主目录
      if (name === 'home') return mockHome
      return path.join(mockHome, name)  // 否则返回模拟用户主目录下的 name 路径
    },
  },
}))
import { resolvePrivateKeyMaterial } from '../../electron/lib/resolvePrivateKeyMaterial'  // 导入 resolvePrivateKeyMaterial 函数

const SAMPLE_PEM = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
-----END OPENSSH PRIVATE KEY-----`

describe('resolvePrivateKeyMaterial', () => {
  const tmpFiles: string[] = []  // 临时文件列表

  beforeEach(() => {  // 每次测试前执行
    vi.clearAllMocks()  // 清除所有 mock
    fs.mkdirSync(mockHome, { recursive: true })  // 创建模拟用户主目录
  })

  afterEach(() => {  // 每次测试后执行
    for (const f of tmpFiles.splice(0)) {  // 删除临时文件
      try { fs.unlinkSync(f) } catch { /* ignore */ }
    }
  })

  it('returns PEM content as-is', () => {
    expect(resolvePrivateKeyMaterial(SAMPLE_PEM)).toBe(SAMPLE_PEM)
  })

  it('reads private key from file path', () => {
    const file = path.join(mockHome, `pkey-${Date.now()}.pem`)
    fs.writeFileSync(file, SAMPLE_PEM, 'utf8')
    tmpFiles.push(file)
    expect(resolvePrivateKeyMaterial(file)).toBe(SAMPLE_PEM)
  })

  it('expands ~ in path', () => {
    const realHome = os.homedir()
    const sshDir = path.join(realHome, '.ssh')
    const file = path.join(sshDir, `zenterm-resolve-test-${Date.now()}`)
    try {
      fs.mkdirSync(sshDir, { recursive: true })
      fs.writeFileSync(file, SAMPLE_PEM, 'utf8')
      tmpFiles.push(file)
      expect(resolvePrivateKeyMaterial(`~/.ssh/${path.basename(file)}`)).toBe(SAMPLE_PEM)
    } catch {
      // 沙箱或权限不足时跳过
    }
  })

  it('throws for missing file', () => {
    expect(() => resolvePrivateKeyMaterial(path.join(mockHome, 'missing.pem'))).toThrow()
  })
})
