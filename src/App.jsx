import { useState, useCallback, useRef, useEffect } from 'react'
import { I18nProvider, useI18n } from './context/I18nContext.jsx'
import TitleBar from './components/TitleBar.jsx'
import Sidebar from './components/Sidebar.jsx'
import TabBar from './components/TabBar.jsx'
import TerminalPanel from './components/TerminalPanel.jsx'
import ConnectDialog from './components/ConnectDialog.jsx'
import SettingsDialog from './components/SettingsDialog.jsx'
import ConnectionTypeIcon from './components/common.jsx'
import {
  loadSavedSessions, addSavedSession, removeSavedSession, duplicateSavedSession, saveSessions, getGroups,
  loadGroupPlaceholders, saveGroupPlaceholders, addGroupPlaceholder, prunePlaceholdersForOccupiedGroups
} from './store/sessionStore.js'
import {
  syncSessionSecretsToVault,
  resolveAffectedSavedId,
  mergeSessionWithVaultSecrets,
  removeVaultEntry,
  duplicateVaultEntry,
  reapplyVaultPoliciesForAllSessions,
} from './store/credentialsBridge.js'
import { loadSettings } from './store/settingsStore.js'
import { resolveEffectiveUiLanguage } from './i18n/resolveUiLanguage.js'
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

/**
 * 主界面（在 I18nProvider 内，可使用 useI18n）
 * @param {{ settings: object, setSettings: function }} props
 * @param {Object} props.settings 设置
 * @param {Function} props.setSettings 设置回调函数
 * @returns {React.ReactNode} 应用主组件
 */
function AppMain({ settings, setSettings }) {
  const { t } = useI18n()
  useEffect(() => {
    const eff = resolveEffectiveUiLanguage(settings.uiLanguage)
    document.documentElement.lang = eff === 'en' ? 'en' : 'zh-CN'
  }, [settings.uiLanguage])

  // 局部变量无法在多次渲染中持久保存、更改局部变量不会触发渲染，因此使用 useState 来管理组件状态，
  // 它保留渲染之间的数据、更新状态(也就是useState的数据，比如这里的使用setSessions更新sessions)会触发组件(这里的组件就是APP)重新渲染以反映最新状态
  const [sessions, setSessions]           = useState([])  // 当前活跃会话列表(上方tab标签页对应的会话)，每个会话对象包含 { id, type, host, username, ... } 等属性
  const [activeId, setActiveId]           = useState(null)  // 当前活跃会话 ID
  const [sidebarOpen, setSidebarOpen]     = useState(true)  // 侧边栏是否打开
  const [sidebarWidth, setSidebarWidth]   = useState(DEFAULT_SIDEBAR_W)  // 侧边栏宽度
  const [savedSessions, setSavedSessions] = useState(() => loadSavedSessions())  // 已保存的会话配置列表，从 localStorage 加载
  const [groupPlaceholders, setGroupPlaceholders] = useState(() => loadGroupPlaceholders())  // 分组占位符列表，从 localStorage 加载
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
      alert(t('app.saveOutputNotReady'))
      return
    }
    const text = getter()
    if (!text?.length) {
      alert(t('app.saveOutputEmpty'))
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
  }, [sessions, t])

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
  const handleSaveOnly = useCallback(async (c) => {
    const config = dialogInitial?.savedId ? { ...c, savedId: dialogInitial.savedId } : c
    const before = dialogInitial?.savedId
      ? savedSessions.find(s => s.savedId === dialogInitial.savedId)
      : null
    const next = addSavedSession(savedSessions, config)
    const vacated = vacatedGroupPathIfEmpty(before, config, next)
    updateSaved(next, vacated ? { placeholderForVacatedGroup: vacated } : undefined)
    const sid = resolveAffectedSavedId(savedSessions, next, config)
    const r = await syncSessionSecretsToVault(sid, config, settings)
    if (!r.ok && r.error) alert(r.error)
    setShowDialog(false)
  }, [savedSessions, updateSaved, dialogInitial, settings])

  /**
   * 保存并连接：先保存会话配置（编辑/新建），然后启动会话。同时检查是否需要添加占位分组
   * @param {Object} c 会话配置对象
   */
  const handleSaveAndConn = useCallback(async (c) => {
    const config = dialogInitial?.savedId ? { ...c, savedId: dialogInitial.savedId } : c
    const before = dialogInitial?.savedId
      ? savedSessions.find(s => s.savedId === dialogInitial.savedId)
      : null
    const next = addSavedSession(savedSessions, config)
    const vacated = vacatedGroupPathIfEmpty(before, config, next)
    updateSaved(next, vacated ? { placeholderForVacatedGroup: vacated } : undefined)
    const sid = resolveAffectedSavedId(savedSessions, next, config)
    const r = await syncSessionSecretsToVault(sid, config, settings)
    if (!r.ok && r.error) alert(r.error)
    launchSession(c)
    setShowDialog(false)
  }, [savedSessions, updateSaved, launchSession, dialogInitial, settings])

  /**
   * 直接连接：不保存会话配置，直接启动会话
   * @param {Object} c 会话配置对象
   */
  const handleConnect = useCallback((c) => { launchSession(c); setShowDialog(false) }, [launchSession])
  const [credDialogState, setCredDialogState] = useState(null)  // 凭证对话框：已合并 vault 的 session + 表单初值（无 callback，由下方专用 handler 处理）

  /**
   * 凭证对话框「保存并连接」：更新已保存会话；仅当 saveSecretsToVault 为 true 时把密码/私钥等写入加密库
   * @param {Object} config 含 savedId 的完整连接配置
   */
  const handleCredentialSaveAndConnect = useCallback(async (config) => {
    if (!config?.savedId) {
      launchSession(config)
      return
    }
    const before = savedSessions.find((s) => s.savedId === config.savedId)
    const next = addSavedSession(savedSessions, config)
    const vacated = vacatedGroupPathIfEmpty(before, config, next)
    updateSaved(next, vacated ? { placeholderForVacatedGroup: vacated } : undefined)
    // 与「保存会话」一致：始终按当前设置同步 vault；仅 saveSecretsToVault 为 true 时才会把本次敏感字段写入加密库，否则写入 null 并清除该会话在库中的旧凭据
    const r = await syncSessionSecretsToVault(config.savedId, config, settings)
    if (!r.ok && r.error) alert(r.error)
    launchSession(config)
  }, [savedSessions, updateSaved, settings, launchSession])

  /**
   * 连接已保存会话：如果是 SSH/Telnet 且缺少用户名或密码，弹出凭证对话框；否则直接启动会话
   * @param {Object} s 会话配置对象
   */
  const handleConnSaved = useCallback((s) => {
    void (async () => {
      const merged = await mergeSessionWithVaultSecrets(s)
      if (merged.type === 'telnet') {
        if (!merged.username?.trim() || !merged.password?.trim()) {
          setCredDialogState({
            session: merged,
            username: merged.username || '',
            password: merged.password || '',
          })
          return
        }
        launchSession(merged)
        return
      }
      if (merged.type === 'ssh') {
        if (!merged.username?.trim()) {
          setCredDialogState({
            session: merged,
            username: merged.username || '',
            password: merged.password || '',
            privateKey: merged.privateKey || '',
            passphrase: merged.passphrase || '',
          })
          return
        }
        if (merged.authType === 'privateKey') {
          if (!merged.privateKey?.trim()) {
            setCredDialogState({
              session: merged,
              username: merged.username || '',
              password: merged.password || '',
              privateKey: merged.privateKey || '',
              passphrase: merged.passphrase || '',
            })
            return
          }
        } else if (!merged.password?.trim()) {
          setCredDialogState({
            session: merged,
            username: merged.username || '',
            password: merged.password || '',
            privateKey: merged.privateKey || '',
            passphrase: merged.passphrase || '',
          })
          return
        }
        launchSession(merged)
      }
    })()
  }, [launchSession])

  /**
   * 删除已保存会话：从 savedSessions 变量中移除会话、考虑是否需要添加占位分组，然后保存到本地 localStorage
   * @param {string} id 会话 ID
   */
  const handleDelSaved = useCallback((id) => {
    const deleted = savedSessions.find(s => s.savedId === id)
    void removeVaultEntry(id)
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
  const handleDuplicateSaved = useCallback(async (savedId) => {
    const next = duplicateSavedSession(savedSessions, savedId)
    const added = next.find((s) => !savedSessions.some((o) => o.savedId === s.savedId))
    if (added?.savedId) await duplicateVaultEntry(savedId, added.savedId)
    updateSaved(next)
  }, [savedSessions, updateSaved])

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
          onDuplicateSaved={handleDuplicateSaved}
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
        <ConnectDialog
          key={`${dialogType}-${dialogInitial?.savedId || 'new'}`}
          type={dialogType}
          initialData={dialogInitial}
          savedGroups={savedGroups}
          onConnect={handleConnect}
          onSaveAndConnect={handleSaveAndConn}
          onSaveOnly={handleSaveOnly}
          onClose={() => setShowDialog(false)}
        />
      )}
      {credDialogState && (
        <CredentialDialog
          username={credDialogState.username}
          password={credDialogState.password}
          privateKey={credDialogState.privateKey}
          passphrase={credDialogState.passphrase}
          session={credDialogState.session}
          saveSecretsToVault={!!settings.saveSecretsToVault}
          onConnect={(username, password, privateKey, passphrase) => {
            const config = {
              ...credDialogState.session,
              username,
              password,
              privateKey: privateKey ?? credDialogState.session.privateKey,
              passphrase: passphrase ?? credDialogState.session.passphrase,
            }
            setCredDialogState(null)
            launchSession(config)
          }}
          onSaveAndConnect={async (username, password, privateKey, passphrase) => {
            const config = {
              ...credDialogState.session,
              username,
              password,
              privateKey: privateKey ?? credDialogState.session.privateKey,
              passphrase: passphrase ?? credDialogState.session.passphrase,
            }
            setCredDialogState(null)
            await handleCredentialSaveAndConnect(config)
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
          onSave={(s) => {
            setSettings(s)
            void reapplyVaultPoliciesForAllSessions(savedSessions, s)
          }}
        />
      )}
    </div>
  )
}

/** 应用主组件 */
export default function App() {
  const [settings, setSettings] = useState(() => loadSettings())
  return (
    <I18nProvider language={settings.uiLanguage}>
      <AppMain settings={settings} setSettings={setSettings} />
    </I18nProvider>
  )
}

/**
 * 欢迎界面组件
 * 显示在没有打开任何会话时，提供新建会话的入口
 * @param {Function} onNewSession 新建会话的回调函数
 */
function WelcomeScreen({ onNewSession }) {
  const { t } = useI18n()
  return (
    <div className="welcome">
      <div className="welcome-logo">
        <span className="welcome-title">ZTerm</span>
        <span className="welcome-sub">{t('welcome.subtitle')}</span>
      </div>
      <div className="welcome-actions">
        {[{type:'ssh',icon:ConnectionTypeIcon.ssh,label:'SSH',desc:t('welcome.sshDesc')},
          {type:'telnet',icon:ConnectionTypeIcon.telnet,label:'Telnet',desc:t('welcome.telnetDesc')},
          {type:'serial',icon:ConnectionTypeIcon.serial,label:'Serial',desc:t('welcome.serialDesc')}].map(b => (
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
 * 连接已保存会话时补充缺失的认证信息（用户名、密码或私钥路径等）
 * @param {Object} props 组件属性
 * @param {string} props.username 用户名
 * @param {string} props.password 密码
 * @param {string} props.privateKey 私钥路径
 * @param {string} props.passphrase 私钥密码短语
 * @param {Object} props.session 会话配置对象 { type, host, port, username, password, privateKey, passphrase, savedId, group, output }
 * @param {boolean} props.saveSecretsToVault 设置中是否开启「保存敏感凭据到加密存储」
 * @param {Function} props.onConnect 仅连接，不把本次输入的敏感信息写入加密库
 * @param {Function} props.onSaveAndConnect 更新已保存会话并连接；仅当 saveSecretsToVault 为 true 时由上层把敏感信息写入 vault
 * @param {Function} props.onClose 关闭对话框
 */
function CredentialDialog({ username, password, privateKey, passphrase, session, saveSecretsToVault, onConnect, onSaveAndConnect, onClose }) {
  const { t } = useI18n()
  const [user, setUser] = useState(username || '')
  const [pass, setPass] = useState(password || '')
  const [pkey, setPkey] = useState(privateKey || '')
  const [pphrase, setPphrase] = useState(passphrase || '')
  const keyAuth = session?.authType === 'privateKey'
  const hasUser = user?.trim()
  const hasPass = pass?.trim()
  const hasPkey = pkey?.trim()
  const autoFocusUser = !hasUser
  const canSave = !!session?.savedId
  const submitConnect = () => onConnect(user, pass, pkey, pphrase)
  const submitSaveAndConnect = () => void onSaveAndConnect(user, pass, pkey, pphrase)

  return (
    <div className="dialog-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dialog">
        <div className="dialog-header">
          <div className="dialog-tabs">{t('credential.title')}</div>
          <button className="dialog-close" onClick={onClose}>×</button>
        </div>
        <div className="dialog-body">
          <div className="form-row">
            <label className="form-label">{t('credential.username')}</label>
            <div className="form-control">
              <input
                placeholder={t('credential.usernamePh')}
                value={user}
                autoFocus={autoFocusUser}
                onChange={e => setUser(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitSaveAndConnect()}
              />
            </div>
          </div>
          {keyAuth ? (
            <>
              <div className="form-row">
                <label className="form-label">{t('credential.privateKeyPath')}</label>
                <div className="form-control">
                  <input
                    placeholder="/path/to/id_rsa"
                    value={pkey}
                    autoFocus={hasUser && !hasPkey}
                    onChange={e => setPkey(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitSaveAndConnect()}
                  />
                </div>
              </div>
              <div className="form-row">
                <label className="form-label">{t('credential.keyPassphrase')}</label>
                <div className="form-control">
                  <input
                    type="password"
                    placeholder={t('credential.optional')}
                    value={pphrase}
                    onChange={e => setPphrase(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitSaveAndConnect()}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="form-row">
              <label className="form-label">{t('credential.password')}</label>
              <div className="form-control">
                <input
                  type="password"
                  placeholder={t('credential.passwordPh')}
                  value={pass}
                  autoFocus={!autoFocusUser && !hasPass}
                  onChange={e => setPass(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitSaveAndConnect()}
                />
              </div>
            </div>
          )}
          {canSave && (
            <p className="cred-dialog-hint">
              {saveSecretsToVault ? t('credential.hintSaveOn') : t('credential.hintSaveOff')}
            </p>
          )}
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn-cancel" onClick={onClose}>{t('credential.cancel')}</button>
          <button type="button" className="btn-connect" onClick={submitConnect}>{t('credential.connect')}</button>
          <button type="button" className="btn-save-connect" disabled={!canSave} onClick={submitSaveAndConnect} title={canSave ? '' : t('credential.notSavedSession')}>{t('credential.saveConnect')}</button>
        </div>
      </div>
    </div>
  )
}
