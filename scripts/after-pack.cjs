/** electron-builder 打包后删除运行时不需要的 Chromium 许可 HTML（约 19MB 解压体积） */
module.exports = async function afterPack(context) {
  const fs = require('node:fs')
  const path = require('node:path')
  const license = path.join(context.appOutDir, 'LICENSES.chromium.html')
  if (fs.existsSync(license)) fs.unlinkSync(license)
}
