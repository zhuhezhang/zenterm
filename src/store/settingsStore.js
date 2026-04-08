const SETTINGS_KEY = 'zterm_settings'

// 获取系统下载目录：通过 preload 暴露的同步 IPC 调用
// window.zterm.getDownloadsPath() 在渲染进程初始化时同步返回真实路径
export const DEFAULT_LOG_PATH = (() => {
  try {
    return window?.zterm?.getDownloadsPath?.() || ''
  } catch { return '' }
})()

export const DEFAULT_SETTINGS = {
  confirmDeleteSession: true,
  confirmDeleteGroup: true,
  deleteGroupWithSessions: false,
  terminalInteract: true,   // 选中复制 + 右键粘贴（合并为一个选项）
  enableLogging: false,
  logPath: DEFAULT_LOG_PATH,
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    const saved = raw ? JSON.parse(raw) : {}
    // 兼容旧版 copyOnSelect / rightClickPaste
    if ('copyOnSelect' in saved || 'rightClickPaste' in saved) {
      saved.terminalInteract = !!(saved.copyOnSelect ?? saved.rightClickPaste ?? true)
      delete saved.copyOnSelect
      delete saved.rightClickPaste
    }
    return { ...DEFAULT_SETTINGS, ...saved }
  } catch (e) {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch (e) {}
}

export const SETTINGS_SCHEMA = [
  {
    section: '操作确认',
    items: [
      { key: 'confirmDeleteSession',    label: '删除会话前确认',         type: 'boolean', desc: '删除保存的会话前弹出确认对话框' },
      { key: 'confirmDeleteGroup',      label: '删除分组前确认',         type: 'boolean', desc: '删除分组前弹出确认对话框' },
      { key: 'deleteGroupWithSessions', label: '删除分组时同时删除会话', type: 'boolean', desc: '关闭时仅删除分组，组内会话变为未分组' },
    ]
  },
  {
    section: '终端行为',
    items: [
      { key: 'terminalInteract', label: '选中复制 / 右键粘贴', type: 'boolean', desc: '选中终端文本自动复制，右键单击粘贴剪贴板内容' },
    ]
  },
  {
    section: '日志',
    items: [
      { key: 'enableLogging', label: '开启终端 I/O 日志', type: 'boolean', desc: '将每个会话的输入输出记录到独立日志文件' },
      { key: 'logPath',       label: '日志保存目录',      type: 'path',    desc: '留空则保存至系统下载目录，每个会话一个 .log 文件' },
    ]
  },
]
