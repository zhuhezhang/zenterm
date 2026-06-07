import type { AppSettings } from '../../types/settings'
import type { SavedSession } from '../../types/session'
import { createImportError } from './handleImportErrors'
import { EXPORT_ENVELOPE_VERSION, IMPORT_MAX_BYTES } from './constants'

/** zterm 导出 envelope */
export interface ExportEnvelope<T> {
  /** 导出类型 */
  ztermExport: 'sessions' | 'settings'
  /** 导出版本 */
  version: number
  /** 导出时间 */
  exportedAt?: string
  /** 导出数据 */
  data: T
}

/**
 * 判断是否为导出 envelope
 * @param parsed 解析后的数据
 * @returns 是否为导出 envelope
 */
function isExportEnvelope(parsed: unknown): parsed is ExportEnvelope<unknown> {
  return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
}

/**
 * 读取并解析导入用 JSON 文件
 * @param file 导入的 JSON 文件对象
 * @returns 解析后的数据
 */
export function readImportJson(file: File): Promise<unknown> {
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
 * @param parsed 解析后的数据
 * @param expectedKind 期望的导出类型
 * @returns 解包后的数据
 */
export function unwrapExportPayload(parsed: unknown, expectedKind: 'sessions'): unknown[]
export function unwrapExportPayload(parsed: unknown, expectedKind: 'settings'): Partial<AppSettings>
export function unwrapExportPayload(
  parsed: unknown,
  expectedKind: 'sessions' | 'settings',
): unknown[] | Partial<AppSettings> {
  if (!isExportEnvelope(parsed)) {
    throw createImportError('invalidPayload')
  }
  if (parsed.ztermExport !== expectedKind) {
    throw createImportError('wrongFileType', { kindKey: expectedKind })
  }
  if (parsed.version !== EXPORT_ENVELOPE_VERSION) {
    throw createImportError('unsupportedVersion', { version: EXPORT_ENVELOPE_VERSION })
  }
  const { data } = parsed
  if (expectedKind === 'sessions') {
    if (!Array.isArray(data)) throw createImportError('invalidPayload')
    return data
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw createImportError('invalidPayload')
  }
  return data as Partial<AppSettings>
}

/**
 * 构造导出 envelope
 * @param kind 导出类型
 * @param data 导出数据
 * @returns 导出 envelope
 */
export function buildExportEnvelope(
  kind: 'sessions' | 'settings',
  data: SavedSession[] | AppSettings,
): ExportEnvelope<SavedSession[] | AppSettings> {
  return {
    ztermExport: kind,
    version: EXPORT_ENVELOPE_VERSION,
    exportedAt: new Date().toString(),
    data,
  }
}
