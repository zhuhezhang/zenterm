/** 统一修改 package.json 与两份 README 顶部的版本号 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 项目根目录 */
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 简易 semver（含可选预发布/构建后缀） */
const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

/** README 语言切换行末尾的 `· vX.Y.Z` */
const README_VERSION_RE = /(·\s*)v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/

/** 新版本号 */
const version = process.argv[2]?.trim()

if (!version) {
  console.error('Usage: npm run mod:ver -- <version>')
  console.error('Example: npm run mod:ver -- 3.3.0')
  process.exit(1)
}

if (!VERSION_RE.test(version)) {  // 验证版本号格式是否符合 semver 规范
  console.error(`Invalid version: ${version}`)
  console.error('Expected semver like 3.3.0 or 3.3.0-beta.1')
  process.exit(1)
}

const pkgPath = path.join(root, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
const oldVersion = pkg.version

if (oldVersion === version) {
  console.log(`Version already ${version}; nothing to change.`)
  process.exit(0)
}

pkg.version = version
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)  // 将 package.json 中的版本号更新为新版本号

/**
 * 更新 README 顶部语言行中的版本号
 * @param fileName 相对仓库根的文件名
 */
function updateReadme(fileName) {
  const filePath = path.join(root, fileName)
  const content = fs.readFileSync(filePath, 'utf8')
  if (!README_VERSION_RE.test(content)) {
    console.error(`Failed to find version marker (· vX.Y.Z) in ${fileName}`)
    process.exit(1)
  }
  const updated = content.replace(README_VERSION_RE, `$1v${version}`)
  fs.writeFileSync(filePath, updated)
}

updateReadme('README.md')  // 更新 README.md 中的版本号
updateReadme('README.zh-CN.md')  // 更新 README.zh-CN.md 中的版本号

console.log(`Version updated: ${oldVersion} → ${version}`)
console.log('  - package.json')
console.log('  - README.md')
console.log('  - README.zh-CN.md')
