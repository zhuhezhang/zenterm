import React, { useState, useCallback, useRef } from 'react'
import TitleBar from './components/TitleBar.jsx'
import Sidebar from './components/Sidebar.jsx'
import TabBar from './components/TabBar.jsx'
import TerminalPanel from './components/TerminalPanel.jsx'
import ConnectDialog from './components/ConnectDialog.jsx'
import SettingsDialog from './components/SettingsDialog.jsx'
import {
  loadSavedSessions, addSavedSession, removeSavedSession, saveSessions, getGroups,
  loadGroupPlaceholders, saveGroupPlaceholders, addGroupPlaceholder, removeGroupPlaceholder
} from './store/sessionStorage.js'
import { loadSettings } from './store/settingsStore.js'
import './styles/app.css'

const DEFAULT_SIDEBAR_W = 300
// 最小/最大宽度根据窗口宽度动态计算（10% ~ 90%），在鼠标移动时实时限制
const getMinSidebar = () => Math.max(80, Math.floor(window.innerWidth * 0.10))
const getMaxSidebar = () => Math.floor(window.innerWidth * 0.90)

function generateId() {
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export default function App() {
  const [sessions, setSessions]           = useState([])
  const [activeId, setActiveId]           = useState(null)
  const [sidebarOpen, setSidebarOpen]     = useState(true)
  const [sidebarWidth, setSidebarWidth]   = useState(DEFAULT_SIDEBAR_W)
  const [savedSessions, setSavedSessions] = useState(() => loadSavedSessions())
  const [groupPlaceholders, setGroupPlaceholders] = useState(() => loadGroupPlaceholders())
  const [settings, setSettings]           = useState(() => loadSettings())
  const [showDialog, setShowDialog]       = useState(false)
  const [showSettings, setShowSettings]   = useState(false)
  const [dialogType, setDialogType]       = useState('ssh')
  const [dialogInitial, setDialogInitial] = useState(null)
  const [sftpState, setSftpState]         = useState({})

  // ── 可拖动分割线 ────────────────────────────────
  const handleDividerMouseDown = useCallback((e) => {
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

  const savedGroups    = getGroups(savedSessions, groupPlaceholders)
  const activeSession  = sessions.find(s => s.id === activeId) || null
  const activeSftpInfo = activeSession?.sftpReady ? sftpState[activeId] : null

  const openDialog = useCallback((type = 'ssh', initial = null) => {
    setDialogType(type); setDialogInitial(initial); setShowDialog(true)
  }, [])

  const launchSession = useCallback((config) => {
    const id = generateId()
    setSessions(prev => [...prev, { id, ...config, status: 'connecting' }])
    setActiveId(id)
    return id
  }, [])

  const removeSession = useCallback((id) => {
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id)
      setActiveId(cur => cur !== id ? cur : next[next.length - 1]?.id || null)
      return next
    })
    setSftpState(prev => { const n = { ...prev }; delete n[id]; return n })
  }, [])

  const updateSession = useCallback((id, updates) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s))
    // 断连时清除 SFTP 状态
    if (updates.sftpReady === false || updates.status === 'disconnected') {
      setSftpState(prev => { const n = { ...prev }; delete n[id]; return n })
    }
  }, [])

  const onSftpReady = useCallback(async (sessionId) => {
    setSftpState(prev => ({ ...prev, [sessionId]: { files: null, path: '/', loading: true } }))
    try {
      const res = await window.zterm.sftp.list(sessionId + '-sftp', '/')
      setSftpState(prev => ({ ...prev, [sessionId]: { files: res.success ? res.items : [], path: '/', loading: false } }))
    } catch {
      setSftpState(prev => ({ ...prev, [sessionId]: { files: [], path: '/', loading: false } }))
    }
  }, [])

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

  const handleSftpGoUp = useCallback(async (sessionId) => {
    const cur = sftpState[sessionId]
    if (!cur || cur.path === '/') return
    const parent = cur.path.split('/').slice(0, -1).join('/') || '/'
    handleSftpNavigate(sessionId, { path: parent })
  }, [sftpState, handleSftpNavigate])

  const handleSftpJumpTo = useCallback(async (sessionId, path) => {
    handleSftpNavigate(sessionId, { path })
  }, [handleSftpNavigate])

  const handleSftpDrop = useCallback(async (sessionId, localFiles, targetItem) => {
    for (const file of localFiles) {
      const remotePath = (targetItem?.path || '/') + '/' + file.name
      await window.zterm.sftp.upload(sessionId + '-sftp', file.path, remotePath)
    }
    const cur = sftpState[sessionId]
    if (cur) handleSftpNavigate(sessionId, { path: cur.path })
  }, [sftpState, handleSftpNavigate])

  const updateSaved       = useCallback((next) => { setSavedSessions(next); saveSessions(next) }, [])
  const updatePlaceholders = useCallback((next) => { setGroupPlaceholders(next); saveGroupPlaceholders(next) }, [])

  // 编辑会话保存：若 initialData 有 savedId，则编辑该会话；否则新建
  const handleSaveOnly    = useCallback((c) => {
    const config = dialogInitial?.savedId ? { ...c, savedId: dialogInitial.savedId } : c
    updateSaved(addSavedSession(savedSessions, config))
    setShowDialog(false)
  }, [savedSessions, updateSaved, dialogInitial])

  const handleSaveAndConn = useCallback((c) => {
    const config = dialogInitial?.savedId ? { ...c, savedId: dialogInitial.savedId } : c
    updateSaved(addSavedSession(savedSessions, config))
    launchSession(c)
    setShowDialog(false)
  }, [savedSessions, updateSaved, launchSession, dialogInitial])

  const handleConnect     = useCallback((c) => { launchSession(c); setShowDialog(false) }, [launchSession])
  const [credDialogState, setCredDialogState] = useState(null)  // { session, callback }

  const handleConnSaved   = useCallback((s) => {
    // SSH/Telnet 如果缺少用户名或密码，弹出凭证对话框
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
  const handleDelSaved    = useCallback((id) => updateSaved(removeSavedSession(savedSessions, id)), [savedSessions, updateSaved])

  // Tab 拖拽排序
  const handleTabReorder  = useCallback((fromId, toId) => {
    setSessions(prev => {
      const from = prev.findIndex(s => s.id === fromId)
      const to   = prev.findIndex(s => s.id === toId)
      if (from < 0 || to < 0) return prev
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
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
                    settings={settings}
                    onClose={() => removeSession(s.id)}
                    onUpdate={(upd) => { updateSession(s.id, upd); if (upd.sftpReady) onSftpReady(s.id) }}
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
          onSaveOnly={handleSaveOnly} onClose={() => setShowDialog(false)} />
      )}
      {credDialogState && (
        <CredentialDialog
          session={credDialogState.session}
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

function CredentialDialog({ session, username, password, onConnect, onClose }) {
  const [user, setUser] = React.useState(username)
  const [pass, setPass] = React.useState(password)
  const hasUser = user?.trim()
  const hasPass = pass?.trim()
  const autoFocusUser = !hasUser
  
  return (
    <div className="dialog-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dialog">
        <div className="dialog-header">
          <div className="dialog-tabs">输入凭证</div>
          <button className="dialog-close" onClick={onClose}>×</button>
        </div>
        <div className="dialog-body">
          <div className="form-row">
            <label className="form-label">用户名</label>
            <div className="form-control">
              <input placeholder="用户名" value={user} autoFocus={autoFocusUser}
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
