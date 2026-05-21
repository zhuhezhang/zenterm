import { createImportError } from './handleImportErrors.js'
import { EXPORT_ENVELOPE_VERSION, IMPORT_MAX_BYTES, IMPORT_WRONG_FILE_KIND_LABEL,
} from './constants.js'

/**
 * 读取并解析导入用 JSON 文件
 * @param {File} file 导入的 JSON 文件
 * @returns {Promise<unknown>} 解析后的 JSON 对象
 */
export function readImportJson(file) {
  return new Promise((resolve, reject) => {
    if (!file || !(file.size >= 0)) {
      reject(createImportError('readFailed'))
      return
    }
    if (file.size > IMPORT_MAX_BYTES) {
      reject(createImportError('fileTooLarge', { max: IMPORT_MAX_BYTES / 1024 / 1024 }))
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {  // 绑定事件：文件读取后触发
      try {
        resolve(JSON.parse(String(e.target?.result ?? '')))  // e.target.result 是读取到的文本内容，尝试解析为 JSON 对象
      } catch {
        reject(createImportError('invalidJson'))
      }
    }
    reader.onerror = () => reject(createImportError('readFailed'))
    reader.readAsText(file)  // 以文本形式读取文件内容，触发 onload 或 onerror 事件
  })
}

/**
 * 解包 zterm 导出 envelope（仅支持 version 1）
 * @param {unknown} parsed 解析后的 JSON 对象
 * @param {'sessions'|'settings'} expectedKind 期望的类型
 * @returns {unknown} 解包后的数据（会话列表或设置对象）
 */
export function unwrapExportPayload(parsed, expectedKind) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {  // 如果解析后的 JSON 对象不是对象或数组，则抛出错误
    throw createImportError('invalidPayload')
  }
  const envelope = /** @type {Record<string, unknown>} */ (parsed)  // 将解析后的 JSON 对象转换为对象
  if (envelope.ztermExport !== expectedKind) {
    throw createImportError('wrongFileType', { kind: IMPORT_WRONG_FILE_KIND_LABEL[expectedKind] })
  }
  if (envelope.version !== EXPORT_ENVELOPE_VERSION) {
    throw createImportError('unsupportedVersion', { version: EXPORT_ENVELOPE_VERSION })
  }
  const { data } = envelope
  if (expectedKind === 'sessions') {
    if (!Array.isArray(data)) throw createImportError('invalidPayload')  // 如果 data 不是数组，则抛出错误
    return data
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {  // 如果 data 不是对象或数组，则抛出错误
    throw createImportError('invalidPayload')
  }
  return data
}

/**
 * 构造导出 envelope
 * @param {'sessions'|'settings'} kind 类型
 * @param {unknown} data 数据
 * @returns {Record<string, unknown>} 导出 envelope
 */
export function buildExportEnvelope(kind, data) {
  return {
    ztermExport: kind,
    version: EXPORT_ENVELOPE_VERSION,
    exportedAt: new Date().toString(),
    data,
  }
}
