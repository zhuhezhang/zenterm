import type { CSSProperties, DragEvent, MouseEvent, RefObject } from 'react'
import type { AppTheme, AppSettings } from './settings'
import type {
  ActiveSession, SavedSession, SessionConfig, SessionTreeNode as TreeNode, 
  SessionType, TerminalClearFn, TerminalTextGetter
} from './session'

/** 连接对话框的属性 */
export interface ConnectDialogProps {
  /** 初始协议类型（ssh/telnet/serial） */
  type: SessionType
  /** 初始配置数据，用于编辑已保存会话时预填充表单 */
  initialData: SessionConfig | null
  /** 已保存的分组列表，用于分组输入的自动补全 */
  savedGroups: string[]
  /** 直接连接的回调函数，参数为配置对象 */
  onConnect: (config: SessionConfig) => void
  /** 保存并连接的回调函数，参数为配置对象 */
  onSaveAndConnect: (config: SessionConfig) => void | Promise<void>
  /** 仅保存的回调函数，参数为配置对象 */
  onSaveOnly: (config: SessionConfig) => void | Promise<void>
  /** 关闭对话框的回调函数 */
  onClose: () => void
}

/** 标签栏的属性 */
export interface TabBarProps {
  /** 会话列表 */
  sessions: ActiveSession[]
  /** 当前活跃标签页的 ID */
  activeId: string | null
  /** 选择标签页的回调函数，参数为标签页 ID */
  onSelect: (id: string) => void
  /** 关闭标签页的回调函数，参数为标签页 ID */
  onClose: (id: string) => void
  /** 新建标签页的回调函数 */
  onNew: () => void
  /** 重新排序标签页的回调函数，参数为源标签页 ID 和目标标签页 ID */
  onReorder: (fromId: string, toId: string) => void
  /** 保存标签页输出的回调函数，参数为标签页 ID */
  onSaveOutput: (sessionId: string) => void | Promise<void>
  /** 清屏的回调函数，参数为标签页 ID */
  onClearScreen?: (sessionId: string) => void
}

/** 终端面板的属性 */
export interface TerminalPanelProps {
  /** 会话对象，包含连接信息和状态 */
  session: ActiveSession
  /** 是否为当前活跃标签页 */
  active: boolean
  /** 更新会话状态的回调函数，参数为会话对象的更新部分 */
  onUpdate: (updates: Partial<ActiveSession>) => void
  /** 终端设置对象，包含用户偏好设置 */
  settings: AppSettings
  /** 应用亮暗（与界面 CSS 变量一致），用于 xterm 配色 */
  appThemeEffective?: 'dark' | 'light'
  /** 注册导出终端输出函数的回调函数，参数为 (sessionId, getter|null) */
  onRegisterExport: (sessionId: string, getter: TerminalTextGetter | null) => void
  /** 注册清屏函数的回调函数，参数为 (sessionId, fn|null) */
  onRegisterClearScreen?: (sessionId: string, fn: TerminalClearFn | null) => void
}

/** 凭证对话框的属性 */
export interface CredentialDialogProps {
  /** 用户名 */
  username?: string
  /** 密码 */
  password?: string
  /** 私钥 */
  privateKey?: string
  /** 密码 */
  passphrase?: string
  /** 会话配置 */
  session: SessionConfig
  /** 是否保存凭证到 Vault */
  saveSecretsToVault: boolean
  /** 连接的回调函数，参数为用户名、密码、私钥和密码短语 */
  onConnect: (username: string, password: string, privateKey: string, passphrase: string) => void
  /** 保存并连接的回调函数，参数为用户名、密码、私钥和密码短语 */
  onSaveAndConnect: (
    username: string,
    password: string,
    privateKey: string,
    passphrase: string,
  ) => void | Promise<void>
  /** 关闭对话框的回调函数 */
  onClose: () => void
}

/** 欢迎屏幕的属性 */
export interface WelcomeScreenProps {
  /** 新建会话的回调函数，参数为协议类型 */
  onNewSession: (type?: SessionType) => void
}

/** 设置对话框的属性 */
export interface SettingsDialogProps {
  /** 设置 */
  settings: AppSettings
  /** 已保存的会话列表 */
  savedSessions: SavedSession[]
  /** 更新会话列表的回调函数，参数为会话列表和选项 */
  onUpdateSessions: (
    sessions: SavedSession[],
    options?: { placeholderForVacatedGroup?: string },
  ) => void
  /** 更新分组占位符的回调函数，参数为分组占位符列表 */
  onUpdatePlaceholders: (placeholders: string[]) => void
  /** 预览应用主题的回调函数，参数为主题对象或 null */
  onAppThemePreview: (theme: AppTheme | null) => void
  /** 关闭对话框的回调函数 */
  onClose: () => void
  /** 保存设置的回调函数，参数为设置 */
  onSave: (settings: AppSettings) => void
}

/** SFTP 远程文件项的属性 */
export interface SftpRemoteItem {
  /** 文件名 */
  name: string
  /** 文件类型 */
  type: 'd' | '-' | string
  /** 文件路径 */
  path?: string
  /** 是否为目录 */
  isDir?: boolean
  /** 文件大小 */
  size?: number
  /** 修改时间 */
  modifyTime?: number
  /** 修改时间 */
  mtime?: number
  /** 权限 */
  rights?: { user?: string; group?: string; other?: string }
}

/** 侧边栏顶部的属性 */
export interface SidebarTopProps {
  /** 是否打开 */
  open: boolean
  /** 切换打开状态的回调函数 */
  onToggle: () => void
  /** 打开设置对话框的回调函数 */
  onOpenSettings: () => void
  /** 翻译函数，参数为路径和参数，返回翻译后的字符串 */
  t: (path: string, params?: Record<string, string | number>) => string
}

/** 文件夹图标的属性 */
export interface FolderIconProps {
  /** 是否打开 */
  open: boolean
}

/** SFTP 面板的属性 */
export interface SftpPanelProps {
  /** 会话对象，包含连接信息和状态 */
  session: ActiveSession
}

/** 侧边栏的属性 */
export interface SidebarProps {
  /** 是否打开 */
  open: boolean
  /** 切换打开状态的回调函数 */
  onToggle: () => void
  /** 已保存的会话列表 */
  savedSessions: SavedSession[]
  /** 新建会话的回调函数，参数为协议类型和初始配置 */
  onNewSession: (type?: SessionType, initial?: SessionConfig | null) => void
  /** 连接会话的回调函数，参数为会话对象 */
  onConnectSaved: (session: SavedSession) => void
  /** 删除会话的回调函数，参数为会话 ID */
  onDeleteSaved: (savedId: string) => void
  /** 更新会话列表的回调函数，参数为会话列表和选项 */
  onUpdateSessions: (
    sessions: SavedSession[],
    options?: { placeholderForVacatedGroup?: string },
  ) => void
  /** 复制会话的回调函数，参数为会话 ID */
  onDuplicateSaved: (savedId: string) => void | Promise<void>
  /** 分组占位符列表 */
  groupPlaceholders: string[]
  /** 更新分组占位符的回调函数，参数为分组占位符列表 */
  onUpdatePlaceholders: (placeholders: string[]) => void
  /** 当前活动会话对象 */
  activeSession: ActiveSession | null
  /** 设置 */
  settings: AppSettings
  /** 打开设置对话框的回调函数 */
  onOpenSettings: () => void
  /** 侧边栏样式 */
  style?: CSSProperties
}

/** 侧边栏上下文菜单的状态 */
export type SidebarContextMenuState =
  | { x: number; y: number; type: 'sessions-header'; data: null }
  | { x: number; y: number; type: 'session'; data: SavedSession }
  | { x: number; y: number; type: 'group'; data: string }

/** 会话树节点的属性 */
export interface SessionTreeNodeComponentProps {
  /** 节点对象，包含 id、type、name、path 和 children 属性 */
  node: TreeNode
  /** 节点深度，表示节点所在的层级 */
  depth: number
  /** 键盘焦点 ID */
  keyboardFocusId: string | null
  /** 是否展开的回调函数，参数为路径 */
  isExp: (path: string) => boolean
  /** 切换展开状态的回调函数，参数为路径 */
  togExp: (path: string) => void
  /** 打开上下文菜单的回调函数，参数为事件、类型和数据 */
  openCtx: (e: MouseEvent, type: SidebarContextMenuState['type'], data: SidebarContextMenuState['data']) => void
  /** 连接会话的回调函数，参数为会话对象 */
  onConnectSaved: (session: SavedSession) => void
  /** 重命名状态，包含路径和新的名称 */
  renaming: string | null
  /** 重命名值，新的名称 */
  renameVal: string
  /** 设置重命名值的回调函数，参数为新的名称 */
  setRenameVal: (v: string) => void
  /** 设置重命名状态的回调函数，参数为路径和新的名称 */
  setRenaming: (v: string | null) => void
  /** 重命名分组的回调函数，参数为旧路径和新的名称 */
  renameGroup: (oldPath: string, newName: string) => void
  /** 重命名分组输入引用 */
  renameGroupInputRef: RefObject<HTMLInputElement | null>
  /** 重命名分组忽略 blur 引用（blur 事件也就是失去焦点事件） */
  ignoreRenameGroupBlurRef: RefObject<boolean>
  /** 重命名会话状态，包含会话 ID 和新的名称 */
  renamingSession: string | null
  /** 重命名会话值，新的名称 */
  renameSessionVal: string
  /** 设置重命名会话状态的回调函数，参数为会话 ID 和新的名称 */
  setRenamingSession: (v: string | null) => void
  /** 设置重命名会话值的回调函数，参数为新的名称 */
  setRenameSessionVal: (v: string) => void
  /** 重命名会话的回调函数，参数为会话 ID 和新的名称 */
  renameSession: (savedId: string, newLabel: string) => void
  /** 重命名会话输入引用 */
  renameSessionInputRef: RefObject<HTMLInputElement | null>
  /** 重命名会话忽略 blur 引用（blur 事件也就是失去焦点事件） */
  ignoreRenameSessionBlurRef: RefObject<boolean>
  /** 拖拽开始事件处理函数，参数为事件、ID 和类型 */
  dStart: (e: DragEvent, id: string, type: string) => void
  /** 拖拽结束事件处理函数 */
  dEnd: () => void
  /** 拖拽覆盖事件处理函数，参数为事件、ID 和区域 */
  dOver: (e: DragEvent, id: string, zone: string) => void
  /** 拖拽离开事件处理函数，参数为事件 */
  dLeave: (e: DragEvent) => void
  /** 拖拽到分组的回调函数，参数为事件和分组路径 */
  dropOnGroup: (e: DragEvent, groupPath: string) => void
  /** 拖拽到会话的回调函数，参数为事件、会话 ID 和分组路径 */
  dropOnSession: (e: DragEvent, sessId: string, groupPath: string) => void
  /** 是否是拖拽目标的回调函数，参数为 ID 和区域 */
  isDO: (id: string, zone: string) => boolean
}

/** 侧边栏上下文菜单的属性 */
export interface SidebarContextMenuProps {
  /** 上下文菜单状态 */
  ctx: SidebarContextMenuState
  /** 关闭上下文菜单的回调函数 */
  closeCtx: () => void
  /** 连接会话的回调函数，参数为会话对象 */
  onConnectSaved: (session: SavedSession) => void
  /** 新建会话的回调函数，参数为协议类型和初始配置 */
  onNewSession: (type?: SessionType, initial?: SessionConfig | null) => void
  /** 复制会话的回调函数，参数为会话 ID */
  dupSession: (id: string) => void
  /** 删除会话的回调函数，参数为会话 ID 和名称 */
  deleteSession: (id: string, label: string) => void
  /** 删除分组的回调函数，参数为分组路径 */
  deleteGroup: (path: string) => void
  /** 设置重命名状态的回调函数，参数为新的名称 */
  setRenaming: (v: string | null) => void
  /** 设置重命名值的回调函数，参数为新的名称 */
  setRenameVal: (v: string) => void
  /** 分组占位符列表 */
  groupPlaceholders: string[]
  /** 更新分组占位符的回调函数，参数为分组占位符列表 */
  onUpdatePlaceholders?: (placeholders: string[]) => void
  /** 展开所有分组的回调函数 */
  expandAll: () => void
  /** 折叠所有分组的回调函数 */
  collapseAll: () => void
  /** 展开所有分组的回调函数，参数为分组路径 */
  expandGroupAll: (groupPath: string) => void
  /** 折叠所有分组的回调函数，参数为分组路径 */
  collapseGroupAll: (groupPath: string) => void
  /** 设置重命名会话状态的回调函数，参数为会话 ID 和新的名称 */
  setRenamingSession: (v: string | null) => void
  /** 设置重命名会话值的回调函数，参数为新的名称 */
  setRenameSessionVal: (v: string) => void
  /** 已保存会话列表 */
  savedSessions: SavedSession[]
  /** 导入会话文件引用，隐藏的文件选择 input */
  importSessionsFileRef: RefObject<HTMLInputElement | null>
}
