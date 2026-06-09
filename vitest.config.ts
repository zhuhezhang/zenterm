// 该文件是 Vitest 的配置文件，用于配置单元测试的运行环境、扫描范围、覆盖率等
import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',  // 在 Node 环境跑，适合主进程 / 工具函数，不是浏览器
    include: ['tests/**/*.test.ts'],  // 只扫描 tests/ 下以 .test.ts 结尾的文件
    coverage: {  // npm run test:coverage 时统计覆盖率
      provider: 'v8',  // 使用 V8 覆盖率引擎
      include: ['src/lib/**', 'shared/**', 'electron/lib/**'],  // 统计 src/lib、shared、electron/lib 的覆盖率
      exclude: ['**/*.d.ts', '**/types/**'],  // 排除 .d.ts 和 types/ 目录
      thresholds: {  // 覆盖率阈值，不达标则报错
        lines: 30,  // 行覆盖率至少 30%
        functions: 30,  // 函数覆盖率至少 30%
        branches: 25,  // 分支覆盖率至少 25%
        statements: 30,  // 语句覆盖率至少 30%
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),  // 和 Vite 一样，@/ 可以指 src/（部分测试仍用相对路径 import 源码）
    },
  },
})
