import { buildExportEnvelope } from './parseImportFile.js'
import { EXPORT_FILENAME_PREFIX } from './constants.js'
import { formatIpcResponseError } from '../ipc/formatIpcError.js'

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
 * 将会话/设置 envelope 通过主进程另存为导出（受 localPathPolicy 限制）
 * @param {keyof typeof EXPORT_FILENAME_PREFIX} kind 导出类型（设置/会话）
 * @param {unknown} data 导出数据
 * @param {(key: string, params?: Record<string, string|number>) => string} t 翻译函数（用于错误 alert）
 */
export async function downloadJsonExport(kind, data, t) {
  const payload = buildExportEnvelope(kind, data)
  const jsonText = JSON.stringify(payload, null, 2)
  const filename = buildExportFilename(kind)
  try {
    const res = await window.zterm.saveJsonExport(filename, jsonText)
    if (res?.content?.canceled) return
    if (res?.success === false) {
      alert(formatIpcResponseError(t, res) || t('settings.exportFail', { msg: res?.content?.error ?? '' }))
    }
  } catch (err) {
    alert(t('settings.exportFail', { msg: err?.message ?? String(err) }))
  }
}
