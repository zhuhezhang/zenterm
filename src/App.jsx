import { useState, useCallback } from 'react'
import TitleBar from './components/TitleBar.jsx'
import Sidebar from './components/Sidebar.jsx'
import TabBar from './components/TabBar.jsx'
import TerminalPanel from './components/TerminalPanel.jsx'
import ConnectDialog from './components/ConnectDialog.jsx'
import SettingsDialog from './components/SettingsDialog.jsx'
import {
  loadSavedSessions, addSavedSession, removeSavedSession, saveSessions, getGroups,
  loadGroupPlaceholders, saveGroupPlaceholders
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

/** 主应用组件 */
export default function App() {
  // 局部变量无法在多次渲染中持久保存、更改局部变量不会触发渲染，因此使用 useState 来管理组件状态，
  // 它保留渲染之间的数据、更新状态(也就是useState的数据，比如这里的使用setSessions更新sessions)会触发组件(这里的组件就是APP)重新渲染以反映最新状态
  const [sessions, setSessions]           = useState([])  // 当前活跃会话列表
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
  const [sftpState, setSftpState]         = useState({})  // SFTP 状态，格式为 { [sessionId]: { files, path, loading } }

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
  /** ?.是可选链运算符，用于访问一个可能为空或者未定义的对象的属性，如果对象为空或者未定义，它会返回 undefined，而不会抛出错误
  这里意思为：activeSession 存在且 sftpReady 为真时，返回 sftpState[activeId]；否则返回 null */
  const activeSftpInfo = activeSession?.sftpReady ? sftpState[activeId] : null  // 当前活跃会话的 SFTP 状态信息，如果没有或未准备好则为 null

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
    setSftpState(prev => { const n = { ...prev }; delete n[id]; return n })  // 删除对应会话的 SFTP 状态，保持 sftpState 与 sessions 同步，避免内存泄漏
  }, [])

  /**
   * 更新会话：应用更新，如果断连则清除 SFTP 状态
   * @param {string} id 会话 ID
   * @param {Object} updates 要更新的属性
   */
  const updateSession = useCallback((id, updates) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
    if (updates.sftpReady === false || updates.status === 'disconnected') {
      setSftpState(prev => { const n = { ...prev }; delete n[id]; return n })
    }
  }, [])

  /**
   * SFTP 就绪时：初始化状态，调用 Electron 主进程的 SFTP 列表 API，更新文件列表
   * @param {string} sessionId 会话 ID
   */
  const onSftpReady = useCallback(async (sessionId) => {
    setSftpState(prev => ({ ...prev, [sessionId]: { files: null, path: '/', loading: true } }))
    try {
      const res = await window.zterm.sftp.list(sessionId + '-sftp', '/')
      setSftpState(prev => ({ ...prev, [sessionId]: { files: res.success ? res.items : [], path: '/', loading: false } }))
    } catch {
      setSftpState(prev => ({ ...prev, [sessionId]: { files: [], path: '/', loading: false } }))
    }
  }, [])

  /**
   * 导航到 SFTP 目录：设置加载状态，获取新路径的文件列表
   * @param {string} sessionId 会话 ID
   * @param {Object} item 目录项对象
   */
  const handleSftpNavigate = useCallback(async (sessionId, item) => {
    setSftpState(prev => ({ ...prev, [sessionId]: { ...prev[sessionId], loading: true } }))
    const res = await window.zterm.sftp.list(sessionId + '-sftp', item.path)
    setSftpState(prev => ({
      ...prev,
      [sessionId]: res.success
        ? { files: res.items, path: item.path, loading: false }
        : { ...prev[sessionId], loading: false }
    }))
  }, [])

  /**
   * 返回上级目录：计算父路径，调用导航函数
   * @param {string} sessionId 会话 ID
   */
  const handleSftpGoUp = useCallback(async (sessionId) => {
    const cur = sftpState[sessionId]
    if (!cur || cur.path === '/') return
    const parent = cur.path.split('/').slice(0, -1).join('/') || '/'
    handleSftpNavigate(sessionId, { path: parent })
  }, [sftpState, handleSftpNavigate])

  /**
   * 跳转到指定路径：直接调用导航函数
   * @param {string} sessionId 会话 ID
   * @param {string} path 目标路径
   */
  const handleSftpJumpTo = useCallback(async (sessionId, path) => {
    handleSftpNavigate(sessionId, { path })
  }, [handleSftpNavigate])

  /**
   * 处理 SFTP 文件拖放上传：遍历本地文件列表，调用 Electron 主进程的 SFTP 上传 API，上传完成后刷新当前目录
   * @param {string} sessionId 会话 ID
   * @param {Array} localFiles 本地文件列表
   * @param {Object|null} targetItem 目标目录项对象
   */
  const handleSftpDrop = useCallback(async (sessionId, localFiles, targetItem) => {
    for (const file of localFiles) {
      const remotePath = (targetItem?.path || '/') + '/' + file.name
      await window.zterm.sftp.upload(sessionId + '-sftp', file.path, remotePath)
    }
    const cur = sftpState[sessionId]
    if (cur) handleSftpNavigate(sessionId, { path: cur.path })
  }, [sftpState, handleSftpNavigate])

  /**
   * 更新已保存会话列表并持久化到 localStorage
   * @param {Array} next 新的会话列表
   */
  const updateSaved = useCallback((next) => { setSavedSessions(next); saveSessions(next) }, [])
  /**
   * 更新分组占位符列表并持久化到 localStorage
   * @param {Array} next 新的占位符列表
   */
  const updatePlaceholders = useCallback((next) => { setGroupPlaceholders(next); saveGroupPlaceholders(next) }, [])

  /**
   * 仅保存会话（编辑/新建）：若 initialData 有 savedId，则编辑该会话；否则新建
   * @param {Object} c 会话配置对象
   */
  const handleSaveOnly = useCallback((c) => {
    const config = dialogInitial?.savedId ? { ...c, savedId: dialogInitial.savedId } : c
    updateSaved(addSavedSession(savedSessions, config))
    setShowDialog(false)
  }, [savedSessions, updateSaved, dialogInitial])

  /**
   * 保存并连接：先保存会话配置（编辑/新建），然后启动会话
   * @param {Object} c 会话配置对象
   */
  const handleSaveAndConn = useCallback((c) => {
    const config = dialogInitial?.savedId ? { ...c, savedId: dialogInitial.savedId } : c
    updateSaved(addSavedSession(savedSessions, config))
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
   * 删除已保存会话：从 savedSessions 中移除，并更新状态和 localStorage
   * @param {string} id 会话 ID
   */
  const handleDelSaved = useCallback((id) => updateSaved(removeSavedSession(savedSessions, id)), [savedSessions, updateSaved])

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
          activeSftpSessionId={activeSession?.sftpReady ? activeId : null}
          sftpFiles={activeSftpInfo?.files}
          sftpPath={activeSftpInfo?.path}
          sftpLoading={activeSftpInfo?.loading}
          onSftpNavigate={(item) => handleSftpNavigate(activeId, item)}
          onSftpGoUp={() => handleSftpGoUp(activeId)}
          onSftpJumpTo={(path) => handleSftpJumpTo(activeId, path)}
          onSftpDrop={(files, t) => handleSftpDrop(activeId, files, t)}
          settings={settings}
          onOpenSettings={() => setShowSettings(true)}
          style={sidebarOpen ? { width: sidebarWidth } : undefined}
        />

        {sidebarOpen && (
          <div className="resize-divider" onMouseDown={handleDividerMouseDown} />
        )}

        <div className="main-area">
          <TabBar sessions={sessions} activeId={activeId} onSelect={setActiveId} onClose={removeSession} onNew={() => openDialog('ssh')} onReorder={handleTabReorder} />
          <div className="content-area">
            <div className="terminal-area">
              {sessions.length === 0
                ? <WelcomeScreen onNewSession={openDialog} />
                : sessions.map(s => (
                  <TerminalPanel key={s.id} session={s} active={s.id === activeId}
                    settings={settings} onUpdate={(upd) => { updateSession(s.id, upd); if (upd.sftpReady) onSftpReady(s.id) }}
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
        {[{type:'ssh',icon:'⌨',label:'SSH',desc:'Secure Shell'},
          {type:'telnet',icon:'🔌',label:'Telnet',desc:'Telnet Protocol'},
          {type:'serial',icon:'⚡',label:'Serial',desc:'Serial Port'}].map(b => (
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
