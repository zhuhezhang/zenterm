/** 构建 Electron 主进程和预加载脚本 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 项目根目录 */
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/** esbuild 参数：sandbox preload 须为 CJS，且输出 .cjs（package.json type:module 下 .js 会被当 ESM） */
const preloadEsbuildArgs = [
  'electron/preload.ts',
  '--bundle',
  '--platform=node',
  '--format=cjs',
  '--outfile=dist-electron/electron/preload.cjs',
  '--external:electron',
]

/**
 * 运行命令并捕获退出状态
 * @param cmd 命令
 * @param args 命令参数
 */
function run(cmd: string, args: string[]): void {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

run('npx', ['tsc', '-p', 'tsconfig/tsconfig.main.json'])
run('npx', ['esbuild', ...preloadEsbuildArgs])
