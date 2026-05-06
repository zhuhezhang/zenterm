import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import '../styles/terminal.css'

/**
 * 二进制数据转 UTF-8 字符串，兼容不同环境下的编码问题
 * @param {string} binary 可能包含非 UTF-8 字符的二进制字符串
 * @returns {string} 转换后的 UTF-8 字符串，如果转换失败则返回原始字符串
 */
function binaryToUtf8(binary) {
  try {
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder('utf-8').decode(bytes)
  } catch (e) { return binary }
}

/**
 * 标准化错误对象，提取原始错误文本
 * @param {unknown} err 错误对象
 * @returns {{ raw: string, lower: string }} 标准化的错误对象
 */
function normalizeError(err) {
  const raw = String(err?.message || err?.error || err || '').trim()
  return { raw, lower: raw.toLowerCase() }
}
/**
 * 将友好提示与原始错误拼接，便于用户理解和排障
 * @param {string} friendly 友好提示
 * @param {string} raw 原始错误文本
 * @returns {string} 拼接后的错误提示
 */
function withRawDetail(friendly, raw) {
  return raw ? `${friendly}（${raw}）` : `${friendly}`
}

/**
 * 映射 SSH 连接错误
 * @param {unknown} err 错误对象
 * @returns {string} 映射后的错误提示
 */
function mapSshError(err) {
  const { raw, lower } = normalizeError(err)
  if (!raw) return 'SSH 连接失败：未知错误'
  if (lower.includes('all configured authentication methods failed') || lower.includes('permission denied')) {
    return withRawDetail('SSH 认证失败：用户名或密码错误', raw)
  }
  if (lower.includes('timed out while waiting for handshake') || lower.includes('etimedout')) {
    return withRawDetail('SSH 连接超时：服务器无响应，请检查网络、主机和端口', raw)
  }
  if (lower.includes('econnrefused')) {
    return withRawDetail('SSH 连接被拒绝：目标端口未开启 SSH 服务', raw)
  }
  if (lower.includes('enotfound') || lower.includes('getaddrinfo')) {
    return withRawDetail('SSH 主机不可达：地址无法解析，请检查主机名或 IP', raw)
  }
  if (lower.includes('ehostunreach') || lower.includes('enetunreach')) {
    return withRawDetail('SSH 主机不可达：网络路由不可达，请检查网络连通性', raw)
  }
  return withRawDetail('SSH 连接失败：请检查连接参数和网络状态', raw)
}
/**
 * 映射 SFTP 连接错误
 * @param {unknown} err 错误对象
 * @returns {string} 映射后的错误提示
 */
function mapSftpError(err) {
  const { raw, lower } = normalizeError(err)
  if (!raw) return 'SFTP 连接失败：未知错误'
  if (lower.includes('no matching key exchange algorithm')) {
    return withRawDetail('SFTP 连接失败：没有匹配的密钥交换算法', raw)
  }
  if (lower.includes('start subsystem') || lower.includes('sftp')) {
    return withRawDetail('SFTP 连接失败：不支持打开 SFTP 子系统', raw)
  }
  return withRawDetail('SFTP 连接失败：请检查连接参数、网络状态、服务器配置等', raw)
}
/**
 * 映射 Telnet 连接错误
 * @param {unknown} err 错误对象
 * @returns {string} 映射后的错误提示
 */
function mapTelnetError(err) {
  const { raw, lower } = normalizeError(err)
  if (!raw) return 'Telnet 连接失败：未知错误'
  if (lower.includes('connection timeout') || lower.includes('etimedout')) {
    return withRawDetail('Telnet 连接超时：服务器无响应，请检查网络、主机和端口', raw)
  }
  if (lower.includes('econnrefused')) {
    return withRawDetail('Telnet 连接被拒绝：目标端口未开启 Telnet 服务', raw)
  }
  if (lower.includes('enotfound') || lower.includes('getaddrinfo')) {
    return withRawDetail('Telnet 主机不可达：地址无法解析，请检查主机名或 IP', raw)
  }
  if (lower.includes('ehostunreach') || lower.includes('enetunreach')) {
    return withRawDetail('Telnet 主机不可达：网络路由不可达，请检查网络连通性', raw)
  }
  return withRawDetail('Telnet 连接失败：请检查连接参数和网络状态', raw)
}
/**
 * 映射串口连接错误
 * @param {unknown} err 错误对象
 * @returns {string} 映射后的错误提示
 */
function mapSerialError(err) {
  const { raw, lower } = normalizeError(err)
  if (!raw) return '串口连接失败：未知错误'
  if (lower.includes('cannot open') || lower.includes('access denied') || lower.includes('eperm') || lower.includes('eacces')) {
    return withRawDetail('串口打开失败：端口被占用或权限不足', raw)
  }
  if (lower.includes('no such file') || lower.includes('enoent')) {
    return withRawDetail('串口不存在：请检查端口路径是否正确', raw)
  }
  if (lower.includes('baud')) {
    return withRawDetail('串口参数错误：请检查波特率等配置', raw)
  }
  return withRawDetail('串口连接失败：请检查端口状态和连接参数', raw)
}

/**
 * TerminalPanel 组件：负责渲染终端界面、管理终端实例和连接会话
 * @param {Object} props 组件属性
 * @param {Object} props.session 会话对象，包含连接信息和状态
 * @param {Boolean} props.active 是否为当前活跃标签页
 * @param {Function} props.onUpdate 会话状态更新回调函数
 * @param {Object} props.settings 全局设置对象，包含用户偏好设置
 * @param {Function} props.onRegisterExport 注册导出终端输出函数的回调，参数为 (sessionId, getter|null)
 */
export default function TerminalPanel({ session, active, onUpdate, settings, onRegisterExport }) {
  /** 终端容器的 DOM 引用，用于挂载 xterm 实例 */
  const containerRef = useRef(null)
  /** Terminal 实例引用，保存对 xterm 实例的访问以便在不同函数中使用 */
  const termRef      = useRef(null)
  /** FitAddon 实例引用，用于在窗口大小变化时调整终端尺寸 */
  const fitAddonRef  = useRef(null)
  /** 清理函数列表引用，用于存储连接相关的清理函数（如事件监听器、连接断开函数等），组件卸载时调用这些函数进行清理 */
  const cleanupRef   = useRef([])
  /** 日志同步函数引用，用于把终端当前可见内容同步到日志文件 */
  const logFileRef   = useRef(null)
  /** 断连状态引用，标记当前连接是否已断开，用于在按键监听中判断是否允许重连 */
  const disconnectedRef = useRef(false)
  /** 设置对象引用，保持对最新设置的访问以便在事件处理函数中使用，避免闭包问题导致访问到过时的设置值 */
  const settingsRef  = useRef(settings)
  useEffect(() => { settingsRef.current = settings }, [settings])

  useEffect(() => {  // 组件初次挂载时：创建终端实例、连接会话，并设置相关事件监听器；组件卸载时：调用 cleanupRef 中的函数进行清理
    if (!containerRef.current) return
    const term = createTerminal()
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())  // WebLinksAddon 负责将终端中的 URL 自动识别为可点击链接
    term.open(containerRef.current)  // 将 xterm 实例挂载到 containerRef.current 指向的 DOM 元素上
    fitAddon.fit()  // 初始调整终端尺寸以适应容器大小
    termRef.current     = term
    fitAddonRef.current = fitAddon

    applyTerminalSettings(term, settingsRef)
    setupLogging(session, settings, term, logFileRef, cleanupRef)

    let cancelled = false
    connectSession(term, fitAddon, session, onUpdate, cleanupRef, disconnectedRef, () => cancelled, logFileRef, settingsRef)

    const ro = new ResizeObserver(() => { try { fitAddon.fit() } catch (e) {} })  // 监听容器尺寸变化，调整终端尺寸以适应新的容器大小
    ro.observe(containerRef.current)
    cleanupRef.current.push(() => ro.disconnect())  // 将 ResizeObserver 的断开函数添加到 cleanupRef 中，以便组件卸载时调用来停止监听尺寸变化

    return () => {  // 清理：卸载时取消连接、清理监听器、销毁终端
      cancelled = true
      cleanupRef.current.forEach(fn => { try { fn() } catch (e) {} })
      cleanupRef.current = []
      term.dispose()
    }
  }, [session.id])

  useEffect(() => {  // 当 active 状态变化时，如果当前标签页变为活跃，则调整终端尺寸并聚焦终端，确保用户界面正确显示并且用户可以立即输入
    if (active && fitAddonRef.current) {
      setTimeout(() => { try { fitAddonRef.current.fit() } catch (e) {} ; termRef.current?.focus() }, 50)
    }
  }, [active])

  useEffect(() => {  // 注册导出终端输出函数：当组件挂载时，注册导出终端输出函数，当组件卸载时，卸载导出终端输出函数
    const getter = () => exportTerminalBuffer(termRef.current)
    onRegisterExport?.(session.id, getter)
    return () => onRegisterExport?.(session.id, null)
  }, [session.id, onRegisterExport])

  useEffect(() => {  // 监听按键事件：当连接断开时，按 R 键触发重连逻辑，重新连接会话并设置相关事件监听器
    const term = termRef.current
    if (!term) return
    const d = term.onKey(({ key }) => {
      if (disconnectedRef.current && (key === 'r' || key === 'R')) {  // 只有在连接断开状态下按 R 键才触发重连，避免误操作导致不必要的连接尝试
        disconnectedRef.current = false
        cleanupRef.current.forEach(fn => { try { fn() } catch (e) {} })  // 调用 cleanupRef 中的函数清理之前的连接状态和事件监听器，确保重连时不会有遗留的状态或监听器干扰新的连接
        cleanupRef.current = []
        const ro = new ResizeObserver(() => { try { fitAddonRef.current.fit() } catch (e) {} })  // 重连时要重新监听容器尺寸变化
        ro.observe(containerRef.current)
        cleanupRef.current.push(() => ro.disconnect())
        term.writeln('\r\x1b[33mReconnecting...\x1b[0m')
        setupLogging(session, settingsRef.current, term, logFileRef, cleanupRef)  // 重连时重新初始化日志
        connectSession(term, fitAddonRef.current, session, onUpdate, cleanupRef, disconnectedRef, null, logFileRef, settingsRef)
      }
    })
    return () => d.dispose()
  }, [session.id])

  return (
    <div className={`terminal-panel ${active ? 'active' : ''}`} style={{ display: active ? 'flex' : 'none' }}>
      <div ref={containerRef} className="terminal-container" />
    </div>
  )
}

/**
 * 导出终端缓冲区中的所有可见文本（包含滚动历史）
 * @param {Terminal|null} term xterm 终端实例
 * @returns {string} 终端纯文本内容
 */
function exportTerminalBuffer(term) {
  if (!term) return ''
  const buf = term.buffer.active
  const lines = []
  for (let i = 0; i < buf.length; i++) {
    const line = buf.getLine(i)
    if (!line) continue
    lines.push(line.translateToString(true).replace(/\u00a0/g, ' '))
  }
  return lines.join('\n').trimEnd()
}

/**
 * 规范化用户输入，兼容部分设备对退格键的不同解释
 * - 一些设备将 DEL(0x7f) 解释为“向前删除”，会导致必须先左移光标才能删除字符
 * - 对 Telnet/Serial 会话把 DEL 转为 BS(0x08)，更符合设备控制台习惯
 * @param {'ssh'|'telnet'|'serial'} type 会话类型
 * @param {string} data xterm 原始输入数据
 * @param {{ current?: { backspaceMode?: string } } | null} settingsRef 设置引用
 * @returns {string} 规范化后的数据
 */
function normalizeInputData(type, data, settingsRef) {
  const mode = (settingsRef?.current?.backspaceMode || 'auto').toLowerCase()
  if (mode === 'del') return data.replace(/\x08/g, '\x7f')
  if (mode === 'bs') return data.replace(/\x7f/g, '\x08')
  // Auto：SSH 默认保留 DEL；Telnet/Serial 默认转为 BS，兼容更多设备
  if (type === 'telnet' || type === 'serial') return data.replace(/\x7f/g, '\x08')
  return data
}

/**
 * 解析十六进制颜色字符串，支持 #RGB 和 #RRGGBB 格式，返回 RGB 数组
 * @param {string} hex 十六进制颜色字符串
 * @returns {[number, number, number]} RGB 数组，如果输入无效则返回黄色 [255, 255, 0] 作为默认值
 */
function parseHexColor(hex) {
  if (!hex || typeof hex !== 'string') return [255, 255, 0]
  let raw = hex.trim()
  if (raw.startsWith('#')) raw = raw.slice(1)
  if (raw.length === 3) raw = raw.split('').map(ch => ch + ch).join('')
  if (raw.length !== 6) return [255, 255, 0]
  const value = parseInt(raw, 16)
  if (Number.isNaN(value)) return [255, 255, 0]
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/**
 * 应用高亮规则
 * @param {string} text 要应用高亮规则的文本
 * @param {Object} settings 设置对象
 * @returns {string} 应用高亮规则后的文本
 */
function applyHighlightRules(text, settings) {
  if (!text || !settings?.highlightRules?.length) return text
  let output = text
  for (const rule of settings.highlightRules) {
    if (!rule?.enabled || !rule.pattern?.trim()) continue
    let regex
    try {
      const pattern = rule.useRegex === false
        ? String(rule.pattern).replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')
        : rule.pattern
      regex = new RegExp(pattern, 'gi')
    } catch (e) {
      continue
    }
    const [r, g, b] = parseHexColor(rule.color)
    const ansi = `\x1b[38;2;${r};${g};${b}m`
    output = output.replace(regex, (match) => `${ansi}${match}\x1b[0m`)
  }
  return output
}

/**
 * 创建并配置 xterm 终端实例
 * @returns {Terminal} 配置好的 Terminal 实例
 */
function createTerminal() {
  return new Terminal({
    fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Menlo, monospace',  // 左到右为字体的优先级
    fontSize: 14,
    lineHeight: 1.4,
    cursorBlink: true,  // 启用光标闪烁，增强可见性
    cursorStyle: 'bar',  // 光标样式为竖线，适合现代终端习惯
    allowTransparency: true,  // 允许背景透明，配合主题颜色可以实现半透明效果
    scrollback: 5000,  // 滚动缓冲区行数，增加可滚动的历史记录
    windowsMode: false,  // 关闭 Windows 模式（影响换行符处理），启用更现代的行为和样式
    theme: {  // 终端配色方案，基于 GitHub Dark Theme，调整了部分颜色以适配半透明背景和增强对比度
      background: '#0d1117', foreground: '#e6edf3',
      cursor: '#58a6ff', cursorAccent: '#0d1117', selectionBackground: '#264f78',
      black: '#484f58', red: '#ff7b72', green: '#3fb950', yellow: '#d29922',
      blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39c5cf', white: '#b1bac4',
      brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364',
      brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff',
      brightCyan: '#56d4dd', brightWhite: '#f0f6fc',
    },
  })
}

/**
 * 应用终端交互设置：根据用户设置启用选中复制和右键粘贴功能
 * @param {Terminal} term - xterm 终端实例
 * @param {Object} settingsRef 设置对象的引用，包含用户偏好设置
 */
function applyTerminalSettings(term, settingsRef) {
  term.onSelectionChange(() => {  // 监听选中时复制：通过 settingsRef 实时读取，保证设置变化后立即生效
    const interact = settingsRef.current?.terminalInteract ?? true  // ?? 是空值合并运算符，表示如果 terminalInteract 不为 null 或 undefined 则使用它，否则默认 true
    if (!interact) return
    const sel = term.getSelection()
    if (sel && sel.length > 0) {
      navigator.clipboard?.writeText(sel).catch(() => {})
    }
  })
  
  const addCtx = () => {  // 右键粘贴：等 term.element 挂载后注册
    if (!term.element) { setTimeout(addCtx, 50); return }  // addCtx 函数递归检查 term.element 是否存在（xterm.js 挂载后才可用），不存在则 50ms 后重试
    term.element.addEventListener('contextmenu', async (e) => {  // 在 term.element 上监听 contextmenu（右键菜单）事件
      const interact = settingsRef.current?.terminalInteract ?? true
      if (!interact) return
      e.preventDefault()
      try { const t = await navigator.clipboard.readText(); term.paste(t) } catch {}
    })
  }
  addCtx()
}

/**
 * 设置日志记录：根据用户设置启用日志功能，生成日志文件名，并将日志写入函数存储在 logFileRef 中以供连接过程中使用
 * @param {Object} session 会话对象
 * @param {Object} settings 设置对象
 * @param {Terminal} term xterm 终端实例
 * @param {Object} logFileRef 日志文件引用
 * @param {Object} cleanupRef 清理函数引用
 */
function setupLogging(session, settings, term, logFileRef, cleanupRef) {
  if (!settings?.enableLogging) return
  const logDir = settings?.logPath || window.zterm?.getDownloadsPath?.()
  if (!logDir) return
  // 文件名由 tab 创建时间和会话标签名组成
  const now = new Date()
  const timestamp = now.getFullYear() + 
    String(now.getMonth()+1).padStart(2,'0') +
    String(now.getDate()).padStart(2,'0') + '_' +
    String(now.getHours()).padStart(2,'0') +
    String(now.getMinutes()).padStart(2,'0') +
    String(now.getSeconds()).padStart(2,'0')  // 生成 YYYYMMDD_HHMMSS 格式的时间戳
  // 过滤文件名非法字符，保留汉字，只删除真正非法的字符
  const rawLabel = session.label || session.host || session.path || session.id || 'session'  // 取会话标签、主机、串口路径、会话 ID 中第一个可用值
  const sessionName = rawLabel
    .replace(/[\/\\:*?"\u003c\u003e|\x00]/g, '')  // 删除非法字符
    .replace(/\s+/g, '_')                         // 空白替换为下划线
    .replace(/^[._]+|[._]+$/g, '')                // 去掉首尾的点和下划线
    .trim() || 'session'
  const logFileName = `${timestamp}_${sessionName}`

  let timer = null
  const flushSnapshot = () => {
    timer = null  // 先把 timer 置空（表示这次节流窗口结束）
    const snapshot = exportTerminalBuffer(term)  // 导出终端缓冲区中的所有可见文本（包含滚动历史）
    window.zterm?.log?.write(logDir, logFileName, snapshot)  // 写入日志文件
  }
  logFileRef.current = () => {  // 节流同步，避免频繁全量写文件
    if (timer != null) return  // 如果已有 timer，直接返回（避免高频触发时每次都写磁盘）
    timer = window.setTimeout(flushSnapshot, 80)  // 设置定时器，80ms 后执行 flushSnapshot 函数
  }
  logFileRef.current()  // 第一次调用，立即执行 flushSnapshot 函数

  cleanupRef.current.push(() => {  // 清理：清除定时器，退出前再同步一次，确保日志与最终终端内容一致
    if (timer != null) {
      window.clearTimeout(timer)
      timer = null
    }
    window.zterm?.log?.write(logDir, logFileName, exportTerminalBuffer(term))
    logFileRef.current = null
  })
}

/**
 * 连接会话：根据会话类型（SSH/Telnet/Serial）调用对应的连接函数，设置数据接收和连接关闭的处理函数，并将清理函数添加到 cleanupRef 以便组件卸载时调用
 * @param {Terminal} term xterm 终端实例
 * @param {FitAddon} fitAddon FitAddon 实例，用于调整终端尺寸
 * @param {Object} session 会话对象，包含连接信息和状态
 * @param {Function} onUpdate 会话状态更新回调函数
 * @param {Object} cleanupRef 清理函数引用，用于存储连接相关的清理函数
 * @param {Object} disconnectedRef 断连状态引用，用于标记当前连接是否已断开
 * @param {Function} isCancelled 可选的取消函数，组件卸载时返回 true，连接过程中定期调用以判断是否应放弃后续操作
 * @param {Object} logFileRef 日志写入函数引用，用于记录连接过程中的日志
 * @param {Object} settingsRef 设置引用，用于读取实时终端行为设置
 */
async function connectSession(term, fitAddon, session, onUpdate, cleanupRef, disconnectedRef, isCancelled, logFileRef, settingsRef) {
  const { id, type } = session  // 从会话对象中提取会话 ID 和类型（SSH/Telnet/Serial）
  const writeInfo    = (m) => term.writeln(`\r\x1b[33m${m}\x1b[0m`)  // 在终端写入黄色信息消息（使用 ANSI 转义码）
  const writeError   = (m) => term.writeln(`\r\x1b[31m${m}\x1b[0m`)  // 在终端写入红色错误消息
  const writeSuccess = (m) => term.writeln(`\r\x1b[32m${m}\x1b[0m`)  // 在终端写入绿色成功消息

  /**
   * 连接断开处理函数：在终端显示断开消息，提示用户按 R 重连，更新会话状态为断开，并设置断连标记
   * @param {string} msg 断开消息内容
   */
  const onDisconnect = (msg) => {
    writeInfo(msg)
    writeInfo('\x1b[2mPress R to reconnect...\x1b[0m')
    disconnectedRef.current = true
    onUpdate({ status: 'disconnected', sftpReady: false })
  }

  /**
   * 数据接收处理函数：将接收到的二进制数据转换为 UTF-8 字符串，写入终端并记录日志
   * @param {string} data 接收到的二进制数据字符串
   */
  const recv = (data) => {
    const decoded = binaryToUtf8(data)
    const highlighted = applyHighlightRules(decoded, settingsRef.current)
    term.write(highlighted, () => logFileRef.current?.())
  }

  if (type === 'ssh') {
    writeInfo(`Connecting to ${session.host}:${session.port || 22}...`)
    try {
      const res = await window.zterm.ssh.connect(id, session)
      if (isCancelled?.()) return   // 组件已卸载，放弃后续注册
      if (!res.success) throw new Error(res.error)  // 连接失败，抛出错误
      writeSuccess('Connected!')
      onUpdate({ status: 'connected' })
      const dim = fitAddon.proposeDimensions() || { cols: 80, rows: 24 }  // 获取终端建议尺寸（列和行），默认80x24
      window.zterm.ssh.resize(id, dim.cols, dim.rows)

      const r1 = window.zterm.ssh.onData(id, recv)  // 注册 SSH 数据接收事件监听器，使用 recv 函数处理数据
      const r2 = window.zterm.ssh.onClose(id, () => onDisconnect('\r\nConnection closed.'))  // 注册 SSH 关闭事件监听器，调用 onDisconnect 处理断开
      const d1 = term.onData((data) => {  // 注册终端数据事件监听器，用户输入时发送数据到 SSH 会话，并同步日志快照
        window.zterm.ssh.sendData(id, normalizeInputData(type, data, settingsRef))
        logFileRef.current?.()
      })
      const d2 = term.onResize(({ cols, rows }) => window.zterm.ssh.resize(id, cols, rows))  // 注册终端尺寸变化事件监听器，调整 SSH 连接尺寸
      cleanupRef.current.push(r1, r2, () => d1.dispose(), () => d2.dispose(), () => window.zterm.ssh.disconnect(id))  // 将所有清理函数添加到 cleanupRef 列表，包括移除监听器和断开连接

      if (session.enableSftp) {  // 如果会话配置启用 SFTP，则尝试连接 SFTP，并在连接成功后更新会话状态以显示 SFTP 功能
        try {
          const sr = await window.zterm.sftp.connect(id + '-sftp', session)
          if (isCancelled?.()) return
          if (sr.success) {
            onUpdate({ status: 'connected', sftpReady: true })
            cleanupRef.current.push(() => window.zterm.sftp.disconnect(id + '-sftp'))
          } else {
            throw new Error(sr.error)
          }
        } catch (e) { 
          writeError(mapSftpError(e))
          window.zterm.ssh.sendData(id, '\n')
          onUpdate({ sftpReady: false })
        }
      }
    } catch (e) {
      if (isCancelled?.()) return
      writeError(mapSshError(e))
      onUpdate({ status: 'error' })
    }

  } else if (type === 'telnet') {
    writeInfo(`Connecting to ${session.host}:${session.port || 23}...`)
    try {
      const res = await window.zterm.telnet.connect(id, session)
      if (isCancelled?.()) return
      if (!res.success) throw new Error(res.error)
      writeSuccess('Connected!')
      onUpdate({ status: 'connected' })
      const r1 = window.zterm.telnet.onData(id, recv)
      const r2 = window.zterm.telnet.onClose(id, () => onDisconnect('\r\nConnection closed.'))
      const d1 = term.onData((data) => {
        window.zterm.telnet.sendData(id, normalizeInputData(type, data, settingsRef))
        logFileRef.current?.()
      })
      cleanupRef.current.push(r1, r2, () => d1.dispose(), () => window.zterm.telnet.disconnect(id))
    } catch (e) {
      if (isCancelled?.()) return
      writeError(mapTelnetError(e))
      onUpdate({ status: 'error' })
    }

  } else if (type === 'serial') {
    writeInfo(`Opening ${session.path} @ ${session.baudRate || 9600} baud...`)
    try {
      const res = await window.zterm.serial.connect(id, session)
      if (isCancelled?.()) return
      if (!res.success) throw new Error(res.error)
      writeSuccess('Serial port opened!')
      onUpdate({ status: 'connected' })
      const r1 = window.zterm.serial.onData(id, recv)
      const r2 = window.zterm.serial.onClose(id, () => onDisconnect('\r\nPort closed.'))
      const d1 = term.onData((data) => {
        window.zterm.serial.sendData(id, normalizeInputData(type, data, settingsRef))
        logFileRef.current?.()
      })
      cleanupRef.current.push(r1, r2, () => d1.dispose(), () => window.zterm.serial.disconnect(id))
    } catch (e) {
      if (isCancelled?.()) return
      writeError(mapSerialError(e))
      onUpdate({ status: 'error' })
    }
  }
}
