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
  /** 日志写入函数引用，保持对当前日志写入函数的访问以便在连接过程中记录日志 */
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
    setupLogging(session, settings, logFileRef, cleanupRef)

    let cancelled = false
    connectSession(term, fitAddon, session, onUpdate, cleanupRef, disconnectedRef, () => cancelled, logFileRef)

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
        setupLogging(session, settingsRef.current, logFileRef, cleanupRef)  // 重连时重新初始化日志（追加到同一文件）
        connectSession(term, fitAddonRef.current, session, onUpdate, cleanupRef, disconnectedRef, null, logFileRef)
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
 * 去除字符串中的 ANSI 转义序列，保留可读文本
 * @param {string} str 可能包含 ANSI 转义序列的字符串
 * @returns {string} 去除 ANSI 序列后的纯文本字符串
 */
function stripAnsi(str) {
  return str
    // CSI 序列：ESC [ ... 最终字节
    .replace(/\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, '')
    // OSC 序列：ESC ] ... BEL 或 ST
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
    // 其他双字节 ESC 序列
    .replace(/\x1b[\x20-\x2f][\x20-\x7e]/g, '')
    .replace(/\x1b[\x40-\x5f\x60-\x7e]/g, '')
    // 控制字符（保留 \t \n \r）
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    // 末尾空格
    .replace(/ +$/gm, '')
}

/**
 * 设置日志记录：根据用户设置启用日志功能，生成日志文件名，并将日志写入函数存储在 logFileRef 中以供连接过程中使用
 * @param {Object} session 会话对象
 * @param {Object} settings 设置对象
 * @param {Object} logFileRef 日志文件引用
 * @param {Object} cleanupRef 清理函数引用
 */
function setupLogging(session, settings, logFileRef, cleanupRef) {
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
  logFileRef.current = (data) => {  // 日志写入函数：接收原始数据，去除 ANSI 序列和末尾空格后写入日志文件，避免日志中包含控制字符和多余空格
    const clean = stripAnsi(data)
    if (clean.trim()) window.zterm?.log?.write(logDir, logFileName, clean)
  }
  cleanupRef.current.push(() => { logFileRef.current = null })  // 将一个清理函数加入 cleanupRef.current，当组件卸载时会调用这个函数来清理日志写入引用，防止后续连接尝试写入日志时访问到已卸载组件的引用导致错误
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
 */
async function connectSession(term, fitAddon, session, onUpdate, cleanupRef, disconnectedRef, isCancelled, logFileRef) {
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
    term.write(decoded)
    logFileRef.current?.(decoded)
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
      const d1 = term.onData((data) => {  // 注册终端数据事件监听器，用户输入时发送数据到 SSH 会话，并记录日志
        window.zterm.ssh.sendData(id, data)
        logFileRef.current?.(data)
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
          }
        } catch (e) { onUpdate({ sftpReady: false }) }
      }
    } catch (e) {
      if (isCancelled?.()) return
      writeError(`Connection failed: ${e.message || e.error}`)
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
        window.zterm.telnet.sendData(id, data)
        logFileRef.current?.(data)
      })
      cleanupRef.current.push(r1, r2, () => d1.dispose(), () => window.zterm.telnet.disconnect(id))
    } catch (e) {
      if (isCancelled?.()) return
      writeError(`Connection failed: ${e.message || e.error}`)
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
        window.zterm.serial.sendData(id, data)
        logFileRef.current?.(data)
      })
      cleanupRef.current.push(r1, r2, () => d1.dispose(), () => window.zterm.serial.disconnect(id))
    } catch (e) {
      if (isCancelled?.()) return
      writeError(`Failed to open port: ${e.message || e.error}`)
      onUpdate({ status: 'error' })
    }
  }
}
