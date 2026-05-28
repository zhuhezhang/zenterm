import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(cmd: string, args: string[]): void {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

run('npx', ['tsc', '-p', 'tsconfig.main.json'])
run('npx', ['tsc', '-p', 'tsconfig.preload.json'])

const preloadJs = path.join(root, 'dist-electron/electron/preload.js')
const preloadCjs = path.join(root, 'dist-electron/electron/preload.cjs')
if (fs.existsSync(preloadJs)) {
  fs.renameSync(preloadJs, preloadCjs)
}
