import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = path.join(root, 'dist-electron/electron')
const preloadJs = path.join(dir, 'preload.js')
const preloadCjs = path.join(dir, 'preload.cjs')

function maybeRename(): void {
  if (!fs.existsSync(preloadJs)) return
  try {
    if (fs.existsSync(preloadCjs)) fs.unlinkSync(preloadCjs)
    fs.renameSync(preloadJs, preloadCjs)
  } catch {
    /* concurrent rename */
  }
}

function startWatch(): void {
  maybeRename()
  fs.watch(dir, { persistent: true }, (_event, filename) => {
    if (filename === 'preload.js') maybeRename()
  })
}

// tsc may not have created the output dir yet when this script starts
if (fs.existsSync(dir)) {
  startWatch()
} else {
  const poll = setInterval(() => {
    if (fs.existsSync(dir)) {
      clearInterval(poll)
      startWatch()
    }
  }, 100)
}
