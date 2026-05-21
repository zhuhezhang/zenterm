import { pushImportWarning } from '../import/pushImportWarning.js'
import { SESSION_GROUP_LABEL_ERROR_KEYS } from './defaults.js'

/**
 * 添加导入警告
 * @param {SessionImportWarning[]} warnings 导入警告列表
 * @param {string} code 警告代码
 * @param {Record<string, string|number>} [params] 警告参数
 */
export function pushSessionImportWarning(warnings, code, params) {
  pushImportWarning(warnings, code, params)
}

/**
 * 解析连接字段标签
 * @param {(key: string, params?: Record<string, string|number>) => string} t 翻译函数
 * @param {string} fieldKey 字段键
 * @returns {string} 字段标签
 */
function resolveConnectFieldLabel(t, fieldKey) {
  const labelKey = `connect.${fieldKey}`
  const label = t(labelKey)
  return label !== labelKey ? label : fieldKey
}

/**
 * 解析连接原因
 * @param {(key: string, params?: Record<string, string|number>) => string} t 翻译函数
 * @param {string} reason 原因
 * @returns {string} 原因文本
 */
function formatSessionSkipReason(t, reason) {
  const connectKey = SESSION_GROUP_LABEL_ERROR_KEYS[reason]
  if (connectKey) {
    const msg = t(connectKey)
    if (msg !== connectKey) return msg
  }
  const key = `settings.importSessionWarnings.skipReason.${reason}`
  const msg = t(key)
  return msg !== key ? msg : reason
}

/**
 * 格式化导入警告
 * @param {(key: string, params?: Record<string, string|number>) => string} t 翻译函数
 * @param {SessionImportWarning} warning 导入警告
 * @returns {string} 格式化后的导入警告
 */
export function formatSessionImportWarning(t, warning) {
  const params = { ...(warning.params || {}) }
  if (typeof params.field === 'string') {
    params.fieldLabel = resolveConnectFieldLabel(t, params.field)
  }
  if (typeof params.reason === 'string') {
    params.reasonText = formatSessionSkipReason(t, params.reason)
  }
  if (warning.code === 'mergeDuplicateLabel') {
    const g = String(params.group ?? '').trim()
    params.group = g || t('settings.importSessionWarnings.ungrouped')
  }
  const key = `settings.importSessionWarnings.${warning.code}`
  const msg = t(key, params)
  return msg !== key ? msg : warning.code
}

/**
 * 格式化导入警告列表
 * @param {(key: string, params?: Record<string, string|number>) => string} t 翻译函数
 * @param {SessionImportWarning[]} warnings 导入警告列表
 * @returns {string} 格式化后的导入警告列表
 */
export function formatSessionImportWarnings(t, warnings) {
  if (!warnings?.length) return ''
  return warnings.map((w) => formatSessionImportWarning(t, w)).join('\n')
}
