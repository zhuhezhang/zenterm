/** 标签名 / 文件名非法字符（含 /）；主进程路径校验与渲染进程 SFTP 等共用 */
export const INVALID_LABEL_CHARS = new RegExp(
  `[/\\\\:*?"\\u003c\\u003e|${String.fromCharCode(0)}]`,
)

/** SFTP 目录项（主进程 / 渲染进程共用） */
export interface SftpEntry {
  name: string
  type: 'd' | '-' | string
  path?: string
  isDir?: boolean
  size?: number
  modifyTime?: number
  mtime?: number
}
