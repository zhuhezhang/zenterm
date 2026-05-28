/** 标签/分组名、日志主名、SFTP 文件名等共用的非法字符 */
export const INVALID_LABEL_CHARS = new RegExp(
  `[/\\\\:*?"\\u003c\\u003e|${String.fromCharCode(0)}]`,
)
