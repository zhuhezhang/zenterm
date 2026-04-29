/** 本地存储设置的键名 */
const SETTINGS_KEY = 'zterm_settings'

/** 默认日志路径，优先使用系统下载目录，如果获取失败则使用空字符串表示默认位置 */
export const DEFAULT_LOG_PATH = (() => {
  try {
    return window?.zterm?.getDownloadsPath?.() || ''  // 如果 IPC 调用失败或未定义，则返回空字符串，表示使用默认下载目录
  } catch { return '' }
})()

/** 默认设置项 */
export const DEFAULT_SETTINGS = {
  confirmDeleteSession: true,
  confirmDeleteGroup: true,
  deleteGroupWithSessions: false,
  terminalInteract: true,   // 选中复制 + 右键粘贴
  backspaceMode: 'auto',    // 退格键模式：auto / del / bs
  enableLogging: false,
  logPath: DEFAULT_LOG_PATH,
}

/**
 * 加载设置项，从 localStorage 获取并解析 JSON，如果失败则返回默认设置
 * @returns {Object} 设置项对象
 */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    const saved = raw ? JSON.parse(raw) : {}
    if ('copyOnSelect' in saved || 'rightClickPaste' in saved) {  // 兼容旧版 copyOnSelect / rightClickPaste，新版本统一为 terminalInteract
      saved.terminalInteract = !!(saved.copyOnSelect ?? saved.rightClickPaste ?? true)  // !!(...) 把结果强制转换成布尔值；?? 是空值合并运算符，表示如果 copyOnSelect 不为 null 或 undefined 则使用它，否则使用 rightClickPaste，如果 rightClickPaste 也不为 null 或 undefined 则使用它，否则默认 true  
      delete saved.copyOnSelect
      delete saved.rightClickPaste
    }
    return { ...DEFAULT_SETTINGS, ...saved }  // saved 中的值会覆盖默认设置
  } catch (e) {
    return { ...DEFAULT_SETTINGS }
  }
}

/**
 * 保存设置项，将设置对象序列化为 JSON 存储到 localStorage 中
 * @param {Object} settings 要保存的设置项对象
 */
export function saveSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch (e) {}
}

/** 设置项的定义和描述，用于在设置界面动态生成表单 */
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
      {
        key: 'backspaceMode',
        label: '退格键模式',
        type: 'select',
        desc: '设置发送给设备的退格编码。Auto: SSH 用 DEL，Telnet/Serial 用 BS',
        options: [
          { value: 'auto', label: 'Auto' },
          { value: 'del', label: 'DEL (0x7F)' },
          { value: 'bs', label: 'BS (0x08)' },
        ],
      },
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
