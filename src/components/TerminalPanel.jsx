import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import '../styles/terminal.css'

function binaryToUtf8(binary) {
  try {
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder('utf-8').decode(bytes)
  } catch (e) { return binary }
}

export default function TerminalPanel({ session, active, onUpdate, settings }) {
  const containerRef = useRef(null)
  const termRef      = useRef(null)
  const fitAddonRef  = useRef(null)
  const cleanupRef   = useRef([])
  const logFileRef   = useRef(null)
  const disconnectedRef = useRef(false)
  const settingsRef  = useRef(settings)
  useEffect(() => { settingsRef.current = settings }, [settings])

  // 初次挂载：创建终端并连接
  useEffect(() => {
    if (!containerRef.current) return
    const term = createTerminal(settings)
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)
    fitAddon.fit()
    termRef.current     = term
    fitAddonRef.current = fitAddon

    applyTerminalSettings(term, settingsRef)
    setupLogging(term, session, settings, logFileRef, cleanupRef)

    let cancelled = false
    connectSession(term, fitAddon, session, onUpdate, cleanupRef, disconnectedRef, settings, () => cancelled, logFileRef)

    const ro = new ResizeObserver(() => { try { fitAddon.fit() } catch (e) {} })
    ro.observe(containerRef.current)
    cleanupRef.current.push(() => ro.disconnect())

    return () => {
      cancelled = true
      cleanupRef.current.forEach(fn => { try { fn() } catch (e) {} })
      cleanupRef.current = []
      term.dispose()
    }
  }, [session.id])

  // 激活时 focus + fit
  useEffect(() => {
    if (active && fitAddonRef.current) {
      setTimeout(() => { try { fitAddonRef.current.fit() } catch (e) {} ; termRef.current?.focus() }, 50)
    }
  }, [active])

  // 监听断连后的按键 R 重连
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    const d = term.onKey(({ key }) => {
      if (disconnectedRef.current && (key === 'r' || key === 'R')) {
        disconnectedRef.current = false
        cleanupRef.current.forEach(fn => { try { fn() } catch (e) {} })
        cleanupRef.current = []
        term.writeln('\r\x1b[33mReconnecting...\x1b[0m')
        // 重连时重新初始化日志（追加到同一文件）
        setupLogging(term, session, settingsRef.current, logFileRef, cleanupRef)
        connectSession(term, fitAddonRef.current, session, onUpdate, cleanupRef, disconnectedRef, settingsRef.current, null, logFileRef)
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

function createTerminal(settings) {
  return new Terminal({
    fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Menlo, monospace',
    fontSize: 14,
    lineHeight: 1.4,
    cursorBlink: true,
    cursorStyle: 'bar',
    allowTransparency: true,
    scrollback: 5000,
    windowsMode: false,
    theme: {
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

function applyTerminalSettings(term, settingsRef) {
  // 选中时复制：通过 settingsRef 实时读取，保证设置变化后立即生效
  term.onSelectionChange(() => {
    const interact = settingsRef.current?.terminalInteract ?? true
    if (!interact) return
    const sel = term.getSelection()
    if (sel && sel.length > 0) {
      navigator.clipboard?.writeText(sel).catch(() => {})
    }
  })
  // 右键粘贴：等 term.element 挂载后注册
  const addCtx = () => {
    if (!term.element) { setTimeout(addCtx, 50); return }
    term.element.addEventListener('contextmenu', async (e) => {
      const interact = settingsRef.current?.terminalInteract ?? true
      if (!interact) return
      e.preventDefault()
      try { const t = await navigator.clipboard.readText(); term.paste(t) } catch {}
    })
  }
  addCtx()
}

// 过滤 ANSI/VT 转义序列，只保留可读文本
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

function setupLogging(term, session, settings, logFileRef, cleanupRef) {
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
    String(now.getSeconds()).padStart(2,'0')
  // 过滤文件名非法字符，保留汉字，只删除真正非法的字符
  const rawLabel = session.label || session.host || session.path || session.id || 'session'
  const sessionName = rawLabel
    .replace(/[\/\\:*?"\u003c\u003e|\x00]/g, '')  // 删除非法字符
    .replace(/\s+/g, '_')                         // 空白替换为下划线
    .replace(/^[._]+|[._]+$/g, '')                // 去掉首尾的点和下划线
    .trim() || 'session'
  const logFileName = `${timestamp}_${sessionName}`
  logFileRef.current = (data) => {
    const clean = stripAnsi(data)
    if (clean.trim()) window.zterm?.log?.write(logDir, logFileName, clean)
  }
  cleanupRef.current.push(() => { logFileRef.current = null })
}

async function connectSession(term, fitAddon, session, onUpdate, cleanupRef, disconnectedRef, settings, isCancelled, logFileRef) {
  const { id, type } = session
  const writeInfo    = (m) => term.writeln(`\r\x1b[33m${m}\x1b[0m`)
  const writeError   = (m) => term.writeln(`\r\x1b[31m${m}\x1b[0m`)
  const writeSuccess = (m) => term.writeln(`\r\x1b[32m${m}\x1b[0m`)

  const onDisconnect = (msg) => {
    writeInfo(msg)
    writeInfo('\x1b[2mPress R to reconnect...\x1b[0m')
    disconnectedRef.current = true
    onUpdate({ status: 'disconnected', sftpReady: false })
  }

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
      if (!res.success) throw new Error(res.error)
      writeSuccess('Connected!')
      onUpdate({ status: 'connected' })
      const dim = fitAddon.proposeDimensions() || { cols: 80, rows: 24 }
      window.zterm.ssh.resize(id, dim.cols, dim.rows)

      const r1 = window.zterm.ssh.onData(id, recv)
      const r2 = window.zterm.ssh.onClose(id, () => onDisconnect('\r\nConnection closed.'))
      const d1 = term.onData((data) => {
        window.zterm.ssh.sendData(id, data)
        logFileRef.current?.(data)
      })
      const d2 = term.onResize(({ cols, rows }) => window.zterm.ssh.resize(id, cols, rows))
      cleanupRef.current.push(r1, r2, () => d1.dispose(), () => d2.dispose(), () => window.zterm.ssh.disconnect(id))

      if (session.enableSftp) {
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
      const d1 = term.onData((data) => window.zterm.telnet.sendData(id, data))
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
      const d1 = term.onData((data) => window.zterm.serial.sendData(id, data))
      cleanupRef.current.push(r1, r2, () => d1.dispose(), () => window.zterm.serial.disconnect(id))
    } catch (e) {
      if (isCancelled?.()) return
      writeError(`Failed to open port: ${e.message || e.error}`)
      onUpdate({ status: 'error' })
    }
  }
}
