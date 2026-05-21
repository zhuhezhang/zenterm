/** 导入 JSON 文件大小上限（8 MB，会话与设置共用） */
export const IMPORT_MAX_BYTES = 8 * 1024 * 1024

/** 单次导入会话条数上限 */
export const IMPORT_MAX_SESSION_COUNT = 5000

/** zterm 导出 envelope 版本号 */
export const EXPORT_ENVELOPE_VERSION = 1

/** 导出文件名前缀（下载名：{prefix}-YYYYMMDD-HHMMSS.json） */
export const EXPORT_FILENAME_PREFIX = {
  sessions: 'zterm-sessions',
  settings: 'zterm-settings',
}

/** 隐藏 file input 的 accept 属性 */
export const IMPORT_JSON_ACCEPT = '.json'

/** 导入文件类型错误提示中的中文 kind（用于 wrongFileType 错误参数） */
export const IMPORT_WRONG_FILE_KIND_LABEL = {
  sessions: '会话',
  settings: '设置',
}
