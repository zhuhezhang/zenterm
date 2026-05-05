import { useState, useCallback, useRef } from 'react'
import TitleBar from './components/TitleBar.jsx'
import Sidebar from './components/Sidebar.jsx'
import TabBar from './components/TabBar.jsx'
import TerminalPanel from './components/TerminalPanel.jsx'
import ConnectDialog from './components/ConnectDialog.jsx'
import SettingsDialog from './components/SettingsDialog.jsx'
import ConnectionTypeIcon from './components/common.jsx'
import {
  loadSavedSessions, addSavedSession, removeSavedSession, saveSessions, getGroups,
  loadGroupPlaceholders, saveGroupPlaceholders, addGroupPlaceholder, prunePlaceholdersForOccupiedGroups
} from './store/sessionStore.js'
import { loadSettings } from './store/settingsStore.js'
import './styles/app.css'

/** 默认侧边栏宽度 */
const DEFAULT_SIDEBAR_W = 300
/** 获取最小侧边栏宽度。最小宽度不小于 80px，且不小于窗口宽度的 10% */
const getMinSidebar = () => Math.max(80, Math.floor(window.innerWidth * 0.10))
/** 获取最大侧边栏宽度。最大宽度不超过窗口宽度的 90% */
const getMaxSidebar = () => Math.floor(window.innerWidth * 0.90)

/** 生成唯一会话 ID，格式为 sess-时间戳-随机字符串 */
function generateId() {
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

/**
 * 编辑已保存会话后，若原分组路径上已无任何会话，返回该路径以便添加占位分组
 * @param {Object|undefined} beforeSession 保存前的会话对象
 * @param {Object} newConfig 本次提交的配置（含 group）
 * @param {Array} nextSessions addSavedSession 之后的列表
 * @returns {string|undefined} 需恢复为占位符的分组路径，不需要则 undefined
 */
function vacatedGroupPathIfEmpty(beforeSession, newConfig, nextSessions) {
  if (!beforeSession) return undefined
  const oldG = beforeSession.group
  if (!oldG) return undefined
  if ((oldG || '') === (newConfig.group || '')) return undefined
  if (nextSessions.some(s => (s.group || '') === (oldG || ''))) return undefined
  return oldG
}

/**
 * 生成 YYYYMMDD_HHMMSS 格式时间戳
 * @returns {string}
 */
function fileTimestamp() {
  const now = new Date()
  return now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') + '_' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0')
}

/**
 * 过滤文件名非法字符，保留可读标签
 * @param {string} raw 原始文件名
 * @returns {string} 安全文件名
 */
function safeFileToken(raw) {
  return (raw || 'session')
    .replace(/[\/\\:*?"\u003c\u003e|\x00]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .trim() || 'session'
}

/** 主应用组件 */
export default function App() {
  // 局部变量无法在多次渲染中持久保存、更改局部变量不会触发渲染，因此使用 useState 来管理组件状态，
  // 它保留渲染之间的数据、更新状态(也就是useState的数据，比如这里的使用setSessions更新sessions)会触发组件(这里的组件就是APP)重新渲染以反映最新状态
  const [sessions, setSessions]           = useState([])  // 当前活跃会话列表(上方tab标签页对应的会话)，每个会话对象包含 { id, type, host, username, ... } 等属性
  const [activeId, setActiveId]           = useState(null)  // 当前活跃会话 ID
  const [sidebarOpen, setSidebarOpen]     = useState(true)  // 侧边栏是否打开
  const [sidebarWidth, setSidebarWidth]   = useState(DEFAULT_SIDEBAR_W)  // 侧边栏宽度
  const [savedSessions, setSavedSessions] = useState(() => loadSavedSessions())  // 已保存的会话配置列表，从 localStorage 加载
  const [groupPlaceholders, setGroupPlaceholders] = useState(() => loadGroupPlaceholders())  // 分组占位符列表，从 localStorage 加载
  const [settings, setSettings]           = useState(() => loadSettings())  // 应用设置，从 localStorage 加载
  const [showDialog, setShowDialog]       = useState(false)  // 是否显示连接对话框
  const [showSettings, setShowSettings]   = useState(false)  // 是否显示设置对话框
  const [dialogType, setDialogType]       = useState('ssh')  // 连接对话框类型：ssh/telnet/serial
  const [dialogInitial, setDialogInitial] = useState(null)  // 连接对话框初始数据（编辑已保存会话时传入）
  const terminalExportersRef = useRef({})  // 保存每个会话导出终端文本的 getter

  /**
   * 处理侧边栏分割线的拖拽事件：记录起始位置，监听鼠标移动更新宽度，鼠标释放时移除监听器
   * @param {MouseEvent} e 鼠标事件对象，包含鼠标位置等信息
   */
  const handleDividerMouseDown = useCallback((e) => {  // useCallback 在多次渲染中缓存一个函数，直至这个函数的依赖（这里为sidebarWidth）发生改变
    e.preventDefault()
    const startX = e.clientX
    const startW = sidebarWidth
    const onMove = (ev) => setSidebarWidth(
      Math.min(getMaxSidebar(), Math.max(getMinSidebar(), startW + ev.clientX - startX))
    )
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  /** 从已保存会话和分组占位符生成分组列表 */
  const savedGroups    = getGroups(savedSessions, groupPlaceholders)
  /** 当前活跃会话对象，如果 activeId 不存在于 sessions 中则为 null */
  const activeSession  = sessions.find(s => s.id === activeId) || null

  /**
   * 打开连接对话框，设置类型和初始数据（这里使用 useCallback，主要是为了“把这函数做成稳定的、可重用的函数引用”，
   * 让它在组件重渲染时不会不断变动。这种模式在 Hook 里很常见，尤其当这些函数会被传到其他组件或作为依赖使用时）
   * @param {string} type 连接类型，可选值为 'ssh'、'telnet' 或 'serial'
   * @param {Object|null} initial 初始数据，编辑已保存会话时传入
   */
  const openDialog = useCallback((type = 'ssh', initial = null) => {
    setDialogType(type); setDialogInitial(initial); setShowDialog(true)
  }, [])

  /**
   * 启动新会话：生成 ID，添加到会话列表，设置为活跃状态，返回 ID
   * @param {Object} config 会话配置对象
   * @returns {string} 生成的会话 ID
   */
  const launchSession = useCallback((config) => {
    const id = generateId()
    // prev => ... 是函数形式的更新器，prev 代表更新前的旧 sessions 数组，使用函数形式可以确保你基于最新的状态更新，避免并发渲染时出现旧值问题
    // [...prev, {...}] 是使用展开运算符创建一个新的数组，包含旧数组的所有元素以及一个新的会话对象，这样做是为了保持状态的不可变性，确保 React 能正确检测到状态变化并重新渲染组件
    // { id, ...config, status: 'connecting' } 创建一个新的会话对象，包含生成的 ID、传入的配置（type、host、username 等）以及初始状态 'connecting'，然后添加到会话列表中
    setSessions(prev => [...prev, { id, ...config, status: 'connecting' }])
    setActiveId(id)
    return id
  }, [])

  /**
   * 删除会话：从会话列表中移除，更新活跃会话 ID（如果被删除的会话是当前活跃的，则切换到新的最后一个会话，否则保持不变），清除对应的 SFTP 状态
   * @param {string} id 要删除的会话 ID
   */
  const removeSession = useCallback((id) => {
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id)  // 过滤掉要删除的会话，生成新的会话列表
      setActiveId(cur => cur !== id ? cur : next[next.length - 1]?.id || null)  // 更新当前活跃会话 ID，如果被删除的会话是当前活跃的，则切换到新的最后一个会话，否则保持不变
      return next
    })
    delete terminalExportersRef.current[id]
  }, [])

  /**
   * 注册/卸载某个会话的终端导出函数
   * @param {string} sessionId 会话 ID
   * @param {Function|null} getter 导出函数，传 null 表示卸载
   */
  const registerTerminalExporter = useCallback((sessionId, getter) => {
    if (!getter) {
      delete terminalExportersRef.current[sessionId]
      return
    }
    terminalExportersRef.current[sessionId] = getter
  }, [])

  /**
   * 保存某个标签页的终端输出到文本文件
   * @param {string} sessionId 会话 ID
   */
  const handleSaveTabOutput = useCallback((sessionId) => {
    const getter = terminalExportersRef.current[sessionId]
    if (!getter) {
      alert('当前标签页尚未准备好终端输出。')
      return
    }
    const text = getter()
    if (!text?.length) {
      alert('当前标签页暂无可保存的终端输出。')
      return
    }
    const s = sessions.find(v => v.id === sessionId)
    const label = s?.label || `${s?.type?.toUpperCase?.() || 'SESSION'}_${s?.host || s?.path || s?.id || sessionId}`
    const filename = `${fileTimestamp()}_${safeFileToken(label)}.txt`
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, [sessions])

  /**
   * 更新会话属性
   * @param {string} id 会话 ID
   * @param {Object} updates 要更新的属性
   */
  const updateSession = useCallback((id, updates) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
  }, [])

  /**
   * 更新已保存会话列表和分组占位符列表变量，并保存到本地localStorage
   * @param {Array} next 新的会话列表
   * @param {{ placeholderForVacatedGroup?: string }} [options] 编辑会话导致原分组被腾空时，传入原分组路径以写入占位符
   */
  const updateSaved = useCallback((next, options) => {
    setSavedSessions(next)
    saveSessions(next)
    setGroupPlaceholders(prev => {
      let p = prunePlaceholdersForOccupiedGroups(next, prev)
      if (options?.placeholderForVacatedGroup) {
        p = addGroupPlaceholder(p, options.placeholderForVacatedGroup)
      }
      const changed =
        p.length !== prev.length ||
        p.some((g, i) => g !== prev[i])
      if (changed) saveGroupPlaceholders(p)
      return p
    })
  }, [])
  /**
   * 更新分组占位符列表变量，并保存到localStorage
   * @param {Array} next 新的占位符列表
   */
  const updatePlaceholders = useCallback((next) => { setGroupPlaceholders(next); saveGroupPlaceholders(next) }, [])

  /**
   * 仅保存会话（编辑/新建）：若 initialData 有 savedId，则编辑该会话；否则新建。同时检查是否需要添加占位分组
   * @param {Object} c 会话配置对象
   */
  const handleSaveOnly = useCallback((c) => {
    const config = dialogInitial?.savedId ? { ...c, savedId: dialogInitial.savedId } : c
    const before = dialogInitial?.savedId
      ? savedSessions.find(s => s.savedId === dialogInitial.savedId)
      : null
    const next = addSavedSession(savedSessions, config)
    const vacated = vacatedGroupPathIfEmpty(before, config, next)
    updateSaved(next, vacated ? { placeholderForVacatedGroup: vacated } : undefined)
    setShowDialog(false)
  }, [savedSessions, updateSaved, dialogInitial])

  /**
   * 保存并连接：先保存会话配置（编辑/新建），然后启动会话。同时检查是否需要添加占位分组
   * @param {Object} c 会话配置对象
   */
  const handleSaveAndConn = useCallback((c) => {
    const config = dialogInitial?.savedId ? { ...c, savedId: dialogInitial.savedId } : c
    const before = dialogInitial?.savedId
      ? savedSessions.find(s => s.savedId === dialogInitial.savedId)
      : null
    const next = addSavedSession(savedSessions, config)
    const vacated = vacatedGroupPathIfEmpty(before, config, next)
    updateSaved(next, vacated ? { placeholderForVacatedGroup: vacated } : undefined)
    launchSession(c)
    setShowDialog(false)
  }, [savedSessions, updateSaved, launchSession, dialogInitial])

  /**
   * 直接连接：不保存会话配置，直接启动会话
   * @param {Object} c 会话配置对象
   */
  const handleConnect = useCallback((c) => { launchSession(c); setShowDialog(false) }, [launchSession])
  const [credDialogState, setCredDialogState] = useState(null)  // 凭证对话框状态，包含 session、username、password 和 callback 属性，用于在连接已保存会话时弹出输入凭证的对话框
  
  /**
   * 连接已保存会话：如果是 SSH/Telnet 且缺少用户名或密码，弹出凭证对话框；否则直接启动会话
   * @param {Object} s 会话配置对象
   */
  const handleConnSaved = useCallback((s) => {
    if ((s.type === 'ssh' || s.type === 'telnet') && (!s.username?.trim() || !s.password?.trim())) {
      setCredDialogState({
        session: s,
        username: s.username || '',
        password: s.password || '',
        callback: (config) => launchSession(config)
      })
      return
    }
    launchSession(s)
  }, [launchSession])

  /**
   * 删除已保存会话：从 savedSessions 变量中移除会话、考虑是否需要添加占位分组，然后保存到本地 localStorage
   * @param {string} id 会话 ID
   */
  const handleDelSaved = useCallback((id) => {
    const deleted = savedSessions.find(s => s.savedId === id)
    const next = removeSavedSession(savedSessions, id)
    const g = deleted?.group
    const emptyGroup =
      g && !next.some(s => (s.group || '') === (g || '')) ? g : null  // 如果原分组不为空且在新的会话列表中不存在，则需要添加占位分组
    setSavedSessions(next)
    setGroupPlaceholders(prev => {
      let p = prunePlaceholdersForOccupiedGroups(next, prev)
      if (emptyGroup) return addGroupPlaceholder(p, emptyGroup)
      const changed =
        p.length !== prev.length ||
        p.some((name, i) => name !== prev[i])
      if (changed) saveGroupPlaceholders(p)
      return p
    })
  }, [savedSessions])

  /**
   * 处理标签页重新排序：接收拖动的会话 ID 和目标位置的会话 ID，更新 sessions 顺序
   * @param {string} fromId 被拖动的会话 ID
   * @param {string} toId 目标位置的会话 ID
   */
  const handleTabReorder  = useCallback((fromId, toId) => {
    setSessions(prev => {
      const from = prev.findIndex(s => s.id === fromId)  // 找到被拖动的会话在当前列表中的索引，如果找不到则返回 -1
      const to = prev.findIndex(s => s.id === toId)  // 找到目标位置的会话在当前列表中的索引，如果找不到则返回 -1
      if (from < 0 || to < 0) return prev
      const next = [...prev]
      const [item] = next.splice(from, 1)  // 从原位置移除被拖动的会话，splice 返回一个包含被移除元素的数组，这里使用解构赋值取出该元素
      next.splice(to, 0, item)  // 在目标位置插入被拖动的会话，splice 的第二个参数为 0 表示不删除任何元素，而是直接插入
      return next
    })
  }, [])

  return (
    <div className="app">
      <TitleBar />
      <div className="app-body">
        <Sidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen(v => !v)}
          savedSessions={savedSessions}
          onNewSession={openDialog}
          onConnectSaved={handleConnSaved}
          onDeleteSaved={handleDelSaved}
          onUpdateSessions={updateSaved}
          groupPlaceholders={groupPlaceholders}
          onUpdatePlaceholders={updatePlaceholders}
          activeSession={activeSession}
          settings={settings}
          onOpenSettings={() => setShowSettings(true)}
          style={sidebarOpen ? { width: sidebarWidth } : undefined}
        />

        {sidebarOpen && (
          <div className="resize-divider" onMouseDown={handleDividerMouseDown} />
        )}

        <div className="main-area">
          <TabBar sessions={sessions} activeId={activeId} onSelect={setActiveId} onClose={removeSession}
            onNew={() => openDialog('ssh')} onReorder={handleTabReorder} onSaveOutput={handleSaveTabOutput} />
          <div className="content-area">
            <div className="terminal-area">
              {sessions.length === 0
                ? <WelcomeScreen onNewSession={openDialog} />
                : sessions.map(s => (
                  <TerminalPanel key={s.id} session={s} active={s.id === activeId}
                    settings={settings} onRegisterExport={registerTerminalExporter}
                    onUpdate={(upd) => { updateSession(s.id, upd) }}
                  />
                ))
              }
            </div>
          </div>
        </div>
      </div>

      {showDialog && (
        <ConnectDialog type={dialogType} initialData={dialogInitial} savedGroups={savedGroups}
          onConnect={handleConnect} onSaveAndConnect={handleSaveAndConn}
          onSaveOnly={handleSaveOnly}  onClose={() => setShowDialog(false)}/>
      )}
      {credDialogState && (
        <CredentialDialog
          username={credDialogState.username}
          password={credDialogState.password}
          onConnect={(username, password) => {
            const config = { ...credDialogState.session, username, password }
            setCredDialogState(null)
            credDialogState.callback(config)
          }}
          onClose={() => setCredDialogState(null)}
        />
      )}
      {showSettings && (
        <SettingsDialog
          settings={settings}
          savedSessions={savedSessions}
          onUpdateSessions={updateSaved}
          onUpdatePlaceholders={(ph) => { setGroupPlaceholders(ph); saveGroupPlaceholders(ph) }}
          onClose={() => setShowSettings(false)}
          onSave={(s) => setSettings(s)}
        />
      )}
    </div>
  )
}

/**
 * 欢迎界面组件
 * 显示在没有打开任何会话时，提供新建会话的入口
 * @param {Function} onNewSession 新建会话的回调函数
 */
function WelcomeScreen({ onNewSession }) {
  return (
    <div className="welcome">
      <div className="welcome-logo">
        <span className="welcome-title">ZTerm</span>
        <span className="welcome-sub">Terminal Emulator</span>
      </div>
      <div className="welcome-actions">
        {[{type:'ssh',icon:ConnectionTypeIcon.ssh,label:'SSH',desc:'Secure Shell'},
          {type:'telnet',icon:ConnectionTypeIcon.telnet,label:'Telnet',desc:'Telnet Protocol'},
          {type:'serial',icon:ConnectionTypeIcon.serial,label:'Serial',desc:'Serial Port'}].map(b => (
          <button key={b.type} className="welcome-btn" onClick={() => onNewSession(b.type)}>
            <span className="welcome-btn-icon">{b.icon}</span>
            <span className="welcome-btn-label">{b.label}</span>
            <span className="welcome-btn-desc">{b.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * 凭证输入对话框组件
 * 在连接已保存会话时，如果缺少用户名或密码，弹出该对话框让用户输入凭证
 * @param {string} username 初始用户名
 * @param {string} password 初始密码
 * @param {Function} onConnect 连接的回调函数，参数为包含用户名和密码的配置对象
 * @param {Function} onClose 关闭对话框的回调函数
 */
function CredentialDialog({ username, password, onConnect, onClose }) {
  const [user, setUser] = useState(username)
  const [pass, setPass] = useState(password)
  const hasUser = user?.trim()
  const hasPass = pass?.trim()
  const autoFocusUser = !hasUser
  
  return (
    <div className="dialog-overlay" onClick={e => e.target === e.currentTarget && onClose()}>  {/* e.target：实际点击的元素; e.currentTarget：事件绑定的元素（这里是整个 dialog-overlay），当点击“遮罩层”时关闭对话框 */}
      <div className="dialog">
        <div className="dialog-header">
          <div className="dialog-tabs">输入凭证</div>
          <button className="dialog-close" onClick={onClose}>×</button>
        </div>
        <div className="dialog-body">
          <div className="form-row">
            <label className="form-label">用户名</label>
            <div className="form-control">
              <input placeholder="用户名" value={user} autoFocus={autoFocusUser/* 当没有用户名时自动聚焦用户名输入框 */}
                onChange={e => setUser(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    onConnect(user, pass)
                  }
                }} />
            </div>
          </div>
          <div className="form-row">
            <label className="form-label">密码</label>
            <div className="form-control">
              <input type="password" placeholder="密码" value={pass} autoFocus={!autoFocusUser && !hasPass}
                onChange={e => setPass(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    onConnect(user, pass)
                  }
                }} />
            </div>
          </div>
        </div>
        <div className="dialog-footer">
          <button className="btn-cancel" onClick={onClose}>取消</button>
          <button className="btn-connect" onClick={() => onConnect(user, pass)}>连接</button>
        </div>
      </div>
    </div>
  )
}
