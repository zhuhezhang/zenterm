/** 本地存储设置的键名 */
const SETTINGS_KEY = 'zterm_settings'

/** 默认日志路径，优先使用系统下载目录，如果获取失败则使用空字符串表示默认位置 */
export const DEFAULT_LOG_PATH = (() => {
  try {
    return window?.zterm?.getDownloadsPath?.() || ''  // 如果 IPC 调用失败或未定义，则返回空字符串，表示使用默认下载目录
  } catch { return '' }
})()

/** SSH/SFTP 算法默认顺序与可选值 */
export const DEFAULT_ALGORITHM_PREFERENCES = {
  kex: [
    'curve25519-sha256',
    'curve25519-sha256@libssh.org',
    'ecdh-sha2-nistp256',
    'ecdh-sha2-nistp384',
    'diffie-hellman-group14-sha256',
    'diffie-hellman-group14-sha1',
    'diffie-hellman-group-exchange-sha256',
  ],
  serverHostKey: [
    'ssh-ed25519',
    'ecdsa-sha2-nistp256',
    'ecdsa-sha2-nistp384',
    'rsa-sha2-256',
    'rsa-sha2-512',
    'ssh-rsa',
  ],
  cipher: [
    'aes128-gcm',
    'aes256-gcm',
    'aes128-ctr',
    'aes192-ctr',
    'aes256-ctr',
    'aes128-cbc',
    'aes192-cbc',
    'aes256-cbc',
    '3des-cbc',
  ],
  hmac: [
    'hmac-sha2-256-etm@openssh.com',
    'hmac-sha2-512-etm@openssh.com',
    'hmac-sha2-256',
    'hmac-sha2-512',
    'hmac-sha1',
  ],
  compress: [
    'zlib@openssh.com',
    'zlib',
    'none',
  ],
}

/** 默认设置项 */
export const DEFAULT_SETTINGS = {
  confirmDeleteSession: true,
  confirmDeleteGroup: true,
  deleteGroupWithSessions: false,
  terminalInteract: true,   // 选中复制 + 右键粘贴
  backspaceMode: 'auto',    // 退格键模式：auto / del / bs
  enableLogging: false,
  logPath: DEFAULT_LOG_PATH,
  highlightRules: [
    { id: 'error',   enabled: true,  useRegex: true, pattern: 'error|failed|denied|unauthorized', color: '#ff6b6b' },
    { id: 'success', enabled: true,  useRegex: true, pattern: 'success|connected|ready|ok',    color: '#4ade80' },
  ],
  algorithmPreferences: DEFAULT_ALGORITHM_PREFERENCES,
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
    if (saved.algorithmPreferences && typeof saved.algorithmPreferences === 'object') {
      saved.algorithmPreferences = {
        ...DEFAULT_ALGORITHM_PREFERENCES,
        ...saved.algorithmPreferences,
      }
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

/**
 * 导设置项为 JSON 文件，文件名包含当前日期
 * @param {Object} settings 要导出的设置对象
 */
export function exportSettings(settings) {
  const data = JSON.stringify(settings, null, 2)  // null, 2 表示美化缩进为 2 个空格，方便文件阅读
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)  // 生成一个本地可访问的临时 URL，指向这个内存中的文件内容
  const a = document.createElement('a')  // 创建一个隐藏的 <a> 元素，用于触发下载
  a.href = url
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  a.download = `zterm-settings-${date}-${hh}${mm}${ss}.json`
  a.click()  // 程序性地"点击"这个链接，启动浏览器下载流程
  URL.revokeObjectURL(url)  // 释放创建的临时 URL，避免内存泄漏
}

/**
 * 从 JSON 文件中导入设置项，返回一个 Promise，解析成功则返回设置对象，失败则抛出错误
 * @param {File} file 用户选择的 JSON 文件对象
 * @returns {Promise<Object>} 解析后的设置对象
 */
export function importSettings(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()  // 使用浏览器提供的 FileReader API 来读取用户选中的文件内容
    reader.onload = (e) => {  // 绑定事件：文件读取后触发
      try {
        const imported = JSON.parse(e.target.result)  // e.target.result 是读取到的文本内容，尝试解析为 JSON 对象
        if (typeof imported !== 'object' || imported === null) throw new Error('格式错误')
        resolve(imported)
      } catch (err) { reject(err) }
    }
    reader.onerror = reject
    reader.readAsText(file) // 以文本形式读取文件内容，触发 onload 或 onerror 事件
  })
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
