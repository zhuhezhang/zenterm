import { buildExportEnvelope } from './parseImportFile.js'
import { EXPORT_FILENAME_PREFIX } from './constants.js'

/**
 * 生成带时间戳的导出文件名
 * @param {keyof typeof EXPORT_FILENAME_PREFIX} kind 导出类型
 * @returns {string} 导出文件名
 */
export function buildExportFilename(kind) {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  return `${EXPORT_FILENAME_PREFIX[kind]}-${date}-${hh}${mm}${ss}.json`
}

/**
 * 将 envelope 数据触发为浏览器 JSON 下载
 * @param {keyof typeof EXPORT_FILENAME_PREFIX} kind 导出类型（设置/会话）
 * @param {unknown} data 导出数据（设置/会话）
 */
export function downloadJsonExport(kind, data) {
  const payload = buildExportEnvelope(kind, data)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = buildExportFilename(kind)
  a.click()
  URL.revokeObjectURL(url)
}
