/** 标签名 / 文件名非法字符（含 /）；主进程路径校验与渲染进程 SFTP 等共用 */
export const INVALID_LABEL_CHARS = new RegExp(
  `[/\\\\:*?"\\u003c\\u003e|${String.fromCharCode(0)}]`,
)
