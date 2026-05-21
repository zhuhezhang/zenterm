import { pushImportWarning } from '../import/pushImportWarning.js'

/**
 * 添加导入警告
 * @param {SettingsImportWarning[]} warnings 导入警告列表
 * @param {string} code 警告代码
 * @param {Record<string, string|number>} [params] 警告参数
 */
export function pushSettingsImportWarning(warnings, code, params) {
  pushImportWarning(warnings, code, params)
}

/**
 * 解析字段标签
 * @param {(key: string, params?: Record<string, string|number>) => string} t 翻译函数
 * @param {string} fieldKey 字段键
 * @returns {string} 字段标签
 */
function resolveFieldLabel(t, fieldKey) {
  const labelKey = `settings.fields.${fieldKey}.label`
  const label = t(labelKey)
  return label !== labelKey ? label : fieldKey
}

/**
 * 解析算法段标签
 * @param {(key: string, params?: Record<string, string|number>) => string} t 翻译函数
 * @param {string} sectionKey 算法段键
 * @returns {string} 算法段标签
 */
function resolveAlgoSectionLabel(t, sectionKey) {
  const labelKey = `settings.algo.${sectionKey}`
  const label = t(labelKey)
  return label !== labelKey ? label : sectionKey
}

/**
 * 格式化高亮规则原因
 * @param {(key: string, params?: Record<string, string|number>) => string} t 翻译函数
 * @param {string} reason 原因
 * @param {Record<string, string|number>} [params] 原因参数
 * @returns {string} 格式化后的原因
 */
function formatHighlightRuleReason(t, reason, params) {
  const key = `settings.importWarnings.highlightRuleReason.${reason}`
  const msg = t(key, params || {})
  return msg !== key ? msg : reason
}

/**
 * 格式化导入警告
 * @param {(key: string, params?: Record<string, string|number>) => string} t 翻译函数
 * @param {SettingsImportWarning} warning 导入警告
 * @returns {string} 格式化后的导入警告
 */
export function formatSettingsImportWarning(t, warning) {
  const params = { ...(warning.params || {}) }
  if (typeof params.field === 'string') {
    params.fieldLabel = resolveFieldLabel(t, params.field)
  }
  if (typeof params.section === 'string') {
    params.sectionLabel = resolveAlgoSectionLabel(t, params.section)
  }
  if (typeof params.reason === 'string') {
    const reasonParams = {}
    if (typeof params.id === 'string') reasonParams.id = params.id
    if (typeof params.name === 'string') reasonParams.name = params.name
    params.reasonText = formatHighlightRuleReason(t, params.reason, reasonParams)
  }
  const key = `settings.importWarnings.${warning.code}`
  const msg = t(key, params)
  return msg !== key ? msg : `${warning.code}${params.field ? ` (${params.field})` : ''}`
}

/**
 * 格式化导入警告列表
 * @param {(key: string, params?: Record<string, string|number>) => string} t 翻译函数
 * @param {SettingsImportWarning[]} warnings 导入警告列表
 * @returns {string} 格式化后的导入警告列表
 */
export function formatSettingsImportWarnings(t, warnings) {
  if (!warnings?.length) return ''
  return warnings.map((w) => formatSettingsImportWarning(t, w)).join('\n')
}
