import type {
  CSSProperties,
  DragEvent,
  MouseEvent,
  RefObject,
} from 'react'
import type { AppTheme, AppSettings } from './settings'
import type {
  ActiveSession,
  SavedSession,
  SessionConfig,
  SessionTreeNode as TreeNode,
  SessionType,
  TerminalClearFn,
  TerminalTextGetter,
} from './session'

export interface ConnectDialogProps {
  type: SessionType
  initialData: SessionConfig | null
  savedGroups: string[]
  onConnect: (config: SessionConfig) => void
  onSaveAndConnect: (config: SessionConfig) => void | Promise<void>
  onSaveOnly: (config: SessionConfig) => void | Promise<void>
  onClose: () => void
}

export interface TabBarProps {
  sessions: ActiveSession[]
  activeId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
  onReorder: (fromId: string, toId: string) => void
  onSaveOutput: (sessionId: string) => void | Promise<void>
  onClearScreen?: (sessionId: string) => void
}

export interface TerminalPanelProps {
  session: ActiveSession
  active: boolean
  onUpdate: (updates: Partial<ActiveSession>) => void
  settings: AppSettings
  appThemeEffective?: 'dark' | 'light'
  onRegisterExport: (sessionId: string, getter: TerminalTextGetter | null) => void
  onRegisterClearScreen?: (sessionId: string, fn: TerminalClearFn | null) => void
}

export interface CredentialDialogProps {
  username?: string
  password?: string
  privateKey?: string
  passphrase?: string
  session: SessionConfig
  saveSecretsToVault: boolean
  onConnect: (username: string, password: string, privateKey: string, passphrase: string) => void
  onSaveAndConnect: (
    username: string,
    password: string,
    privateKey: string,
    passphrase: string,
  ) => void | Promise<void>
  onClose: () => void
}

export interface WelcomeScreenProps {
  onNewSession: (type?: SessionType) => void
}

export interface SettingsDialogProps {
  settings: AppSettings
  savedSessions: SavedSession[]
  onUpdateSessions: (
    sessions: SavedSession[],
    options?: { placeholderForVacatedGroup?: string },
  ) => void
  onUpdatePlaceholders: (placeholders: string[]) => void
  onAppThemePreview: (theme: AppTheme | null) => void
  onClose: () => void
  onSave: (settings: AppSettings) => void
}

export interface SftpRemoteItem {
  name: string
  type: 'd' | '-' | string
  path?: string
  isDir?: boolean
  size?: number
  modifyTime?: number
  mtime?: number
  rights?: { user?: string; group?: string; other?: string }
}

export interface SidebarTopProps {
  open: boolean
  onToggle: () => void
  onOpenSettings: () => void
  t: (path: string, params?: Record<string, string | number>) => string
}

export interface FolderIconProps {
  open: boolean
}

export interface SftpPanelProps {
  session: ActiveSession
}

export interface SidebarProps {
  open: boolean
  onToggle: () => void
  savedSessions: SavedSession[]
  onNewSession: (type?: SessionType, initial?: SessionConfig | null) => void
  onConnectSaved: (session: SavedSession) => void
  onDeleteSaved: (savedId: string) => void
  onUpdateSessions: (
    sessions: SavedSession[],
    options?: { placeholderForVacatedGroup?: string },
  ) => void
  onDuplicateSaved: (savedId: string) => void | Promise<void>
  groupPlaceholders: string[]
  onUpdatePlaceholders: (placeholders: string[]) => void
  activeSession: ActiveSession | null
  settings: AppSettings
  onOpenSettings: () => void
  style?: CSSProperties
}

export type SidebarContextMenuState =
  | { x: number; y: number; type: 'sessions-header'; data: null }
  | { x: number; y: number; type: 'session'; data: SavedSession }
  | { x: number; y: number; type: 'group'; data: string }

export interface SessionTreeNodeComponentProps {
  node: TreeNode
  depth: number
  keyboardFocusId: string | null
  isExp: (path: string) => boolean
  togExp: (path: string) => void
  openCtx: (e: MouseEvent, type: SidebarContextMenuState['type'], data: SidebarContextMenuState['data']) => void
  onConnectSaved: (session: SavedSession) => void
  renaming: string | null
  renameVal: string
  setRenameVal: (v: string) => void
  setRenaming: (v: string | null) => void
  renameGroup: (oldPath: string, newName: string) => void
  renameGroupInputRef: RefObject<HTMLInputElement | null>
  ignoreRenameGroupBlurRef: RefObject<boolean>
  renamingSession: string | null
  renameSessionVal: string
  setRenamingSession: (v: string | null) => void
  setRenameSessionVal: (v: string) => void
  renameSession: (savedId: string, newLabel: string) => void
  renameSessionInputRef: RefObject<HTMLInputElement | null>
  ignoreRenameSessionBlurRef: RefObject<boolean>
  dStart: (e: DragEvent, id: string, type: string) => void
  dEnd: () => void
  dOver: (e: DragEvent, id: string, zone: string) => void
  dLeave: (e: DragEvent) => void
  dropOnGroup: (e: DragEvent, groupPath: string) => void
  dropOnSession: (e: DragEvent, sessId: string, groupPath: string) => void
  isDO: (id: string, zone: string) => boolean
}

export interface SidebarContextMenuProps {
  ctx: SidebarContextMenuState
  closeCtx: () => void
  onConnectSaved: (session: SavedSession) => void
  onNewSession: (type?: SessionType, initial?: SessionConfig | null) => void
  dupSession: (id: string) => void
  deleteSession: (id: string, label: string) => void
  deleteGroup: (path: string) => void
  setRenaming: (v: string | null) => void
  setRenameVal: (v: string) => void
  groupPlaceholders: string[]
  onUpdatePlaceholders?: (placeholders: string[]) => void
  expandAll: () => void
  collapseAll: () => void
  expandGroupAll: (groupPath: string) => void
  collapseGroupAll: (groupPath: string) => void
  setRenamingSession: (v: string | null) => void
  setRenameSessionVal: (v: string) => void
  savedSessions: SavedSession[]
  importSessionsFileRef: RefObject<HTMLInputElement | null>
}
