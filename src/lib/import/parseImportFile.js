import { createImportError } from './importErrors.js'

/** 导入 JSON 文件大小上限（字节） */
export const IMPORT_MAX_BYTES = 8 * 1024 * 1024

/**
 * 读取并解析导入用 JSON 文件
 * @param {File} file
 * @returns {Promise<unknown>}
 */
export function readImportJson(file) {
  return new Promise((resolve, reject) => {
    if (!file || !(file.size >= 0)) {
      reject(createImportError('readFailed'))
      return
    }
    if (file.size > IMPORT_MAX_BYTES) {
      reject(createImportError('fileTooLarge', { max: '8 MB' }))
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        resolve(JSON.parse(String(e.target?.result ?? '')))
      } catch {
        reject(createImportError('invalidJson'))
      }
    }
    reader.onerror = () => reject(createImportError('readFailed'))
    reader.readAsText(file)
  })
}

/**
 * 解包 zterm 导出 envelope（仅支持 version 1）
 * @param {unknown} parsed
 * @param {'sessions'|'settings'} expectedKind
 * @returns {unknown}
 */
export function unwrapExportPayload(parsed, expectedKind) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw createImportError('wrongFileType')
  }
  const envelope = /** @type {Record<string, unknown>} */ (parsed)
  if (envelope.ztermExport !== expectedKind) {
    throw createImportError('wrongFileType')
  }
  if (envelope.version !== 1) {
    throw createImportError('unsupportedVersion')
  }
  const { data } = envelope
  if (expectedKind === 'sessions') {
    if (!Array.isArray(data)) throw createImportError('invalidPayload')
    return data
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw createImportError('invalidPayload')
  }
  return data
}

/**
 * 构造导出 envelope
 * @param {'sessions'|'settings'} kind
 * @param {unknown} data
 */
export function buildExportEnvelope(kind, data) {
  return {
    ztermExport: kind,
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  }
}
