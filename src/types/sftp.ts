import type { SftpRemoteItem } from './components'

/** SFTP 面板文件行右键菜单 */
export interface SftpFileContextMenu {
  x: number
  y: number
  item: SftpRemoteItem
}
