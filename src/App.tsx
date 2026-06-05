import { useState, useCallback, useEffect, useMemo, lazy, Suspense, memo } from 'react'
import type { AppMainProps } from './types/app'
import type { AppSettings, AppTheme } from './types/settings'
import type { ActiveSession, TerminalClearFn, TerminalTextGetter } from './types/session'
import { I18nProvider } from '@/context/I18nContext'
import { SessionProvider, useSession } from '@/context/SessionContext'
import TitleBar from '@/components/TitleBar'
import Sidebar from '@/components/sidebar/Sidebar'
import TabBar from '@/components/TabBar'
import TerminalPanel from '@/components/TerminalPanel'
import WelcomeScreen from '@/components/app/WelcomeScreen'
import CredentialDialog from '@/components/app/CredentialDialog'

const ConnectDialog = lazy(() => import('@/components/ConnectDialog'))  // 懒加载（code splitting） 写法，目的是让 ConnectDialog 不要打进首屏主包，只在用户真正打开连接对话框时才去加载
const SettingsDialog = lazy(() => import('@/components/SettingsDialog'))
import { useSyncedAppTheme } from '@/hooks/useSyncedAppTheme'
import { useSidebarResize } from '@/hooks/useSidebarResize'
import { loadSettings, refreshDownloadsPathCache, getDefaultLogPath } from './store/settingsStore'
import { DEFAULT_SIDEBAR_WIDTH } from './lib/settings/defaults'
import { clampSidebarWidthPx } from './lib/settings/normalize'
import { resolveEffectiveUiLanguage, syncUiLanguageToMain } from './lib/resolveUiLanguage'
import { reapplyVaultPoliciesForAllSessions } from './store/credentialsBridge'
import './styles/app.css'

/**
 * TerminalPanelSlot 组件：负责渲染终端面板的插槽，用于在 TabBar 中显示终端面板。
 * 使用 memo 包裹，避免不必要的重新渲染，只有当 session.id 发生变化时，才会重新渲染。
 */
const TerminalPanelSlot = memo(function TerminalPanelSlot({
  session,
  active,
  terminalSettings,
  appThemeEffective,
  updateSession,
  onRegisterExport,
  onRegisterClearScreen,
}: {
  /** 会话对象，包含连接信息和状态 */
  session: ActiveSession
  /** 是否为当前活跃标签页 */
  active: boolean
  /** 终端设置对象，包含用户偏好设置 */
  terminalSettings: AppSettings
  /** 应用亮暗（与界面 CSS 变量一致），用于 xterm 配色 */
  appThemeEffective: 'dark' | 'light'
  /** 更新会话状态的回调函数 */
  updateSession: (id: string, upd: Partial<ActiveSession>) => void
  /** 注册导出终端输出函数的回调函数，参数为 (sessionId, getter|null) */
  onRegisterExport: (sessionId: string, getter: TerminalTextGetter | null) => void
  /** 注册清屏函数的回调函数，参数为 (sessionId, fn|null) */
  onRegisterClearScreen: (sessionId: string, fn: TerminalClearFn | null) => void
}) {
  /** 更新会话状态的回调函数，用于在 TerminalPanel 中更新会话状态 */
  const onUpdate = useCallback(
    (upd: Partial<ActiveSession>) => updateSession(session.id, upd),
    [session.id, updateSession],
  )
  return (
    <TerminalPanel
      session={session}
      active={active}
      settings={terminalSettings}
      appThemeEffective={appThemeEffective}
      onRegisterExport={onRegisterExport}
      onRegisterClearScreen={onRegisterClearScreen}
      onUpdate={onUpdate}
    />
  )
})

/** 主界面（在 I18nProvider 内，可使用 useI18n） */
function AppMain({ settings, setSettings }: AppMainProps) {
  const {
    sessions,
    activeId,
    setActiveId,
    savedSessions,
    groupPlaceholders,
    savedGroups,
    activeSession,
    showDialog,
    dialogType,
    dialogInitial,
    credDialogState,
    setCredDialogState,
    openDialog,
    setShowDialog,
    launchSession,
    removeSession,
    updateSession,
    updateSaved,
    updatePlaceholders,
    handleSaveOnly,
    handleSaveAndConn,
    handleConnect,
    handleConnSaved,
    handleDelSaved,
    handleDuplicateSaved,
    handleTabReorder,
    handleCredentialSaveAndConnect,
    registerTerminalExporter,
    registerTerminalClearScreen,
    handleClearTabScreen,
    handleSaveTabOutput,
    handleSetBackspaceMode,
  } = useSession()

  const [appThemePreview, setAppThemePreview] = useState<AppTheme | null>(null)
  const appThemeEffective = useSyncedAppTheme(appThemePreview ?? settings.appTheme)  // ??表示如果 appThemePreview 为 null，则使用 settings.appTheme
  /** 终端设置对象，包含用户偏好设置。当 settings 发生变化时，重新计算终端设置 */
  const terminalSettings = useMemo(() => ({
    loggingMode: settings.loggingMode,
    logPath: settings.logPath,
    terminalScrollback: settings.terminalScrollback,
    terminalInteract: settings.terminalInteract,
    highlightRules: settings.highlightRules,
    uiLanguage: settings.uiLanguage,
    algorithmPreferences: settings.algorithmPreferences,
    sshKeepaliveInterval: settings.sshKeepaliveInterval,
  }), [
    settings.loggingMode,
    settings.logPath,
    settings.terminalScrollback,
    settings.terminalInteract,
    settings.highlightRules,
    settings.uiLanguage,
    settings.algorithmPreferences,
    settings.sshKeepaliveInterval,
  ])

  useEffect(() => {  // 监听 UI 语言变化，更新 document.documentElement.lang
    const eff = resolveEffectiveUiLanguage(settings.uiLanguage)
    document.documentElement.lang = eff === 'en' ? 'en' : 'zh-CN'
    syncUiLanguageToMain(settings.uiLanguage)
  }, [settings.uiLanguage])

  const [sidebarOpen, setSidebarOpen] = useState(true)  // 侧边栏是否打开
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    clampSidebarWidthPx(settings.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH, window.innerWidth)
  )  // 侧边栏宽度（与 settings.sidebarWidth 同步；拖拽结束后写回 localStorage）
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {  // 监听 settings.sidebarWidth 变化，更新 sidebarWidth
    setSidebarWidth((cur) => {
      const w = clampSidebarWidthPx(settings.sidebarWidth, window.innerWidth)
      return w === cur ? cur : w
    })
  }, [settings.sidebarWidth])

  /** 处理侧边栏分割线的拖拽事件：记录起始位置，监听鼠标移动更新宽度，鼠标释放时移除监听 */
  const handleDividerMouseDown = useSidebarResize(sidebarWidth, setSidebarWidth, setSettings)

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
          <TabBar
            sessions={sessions}
            activeId={activeId}
            onSelect={setActiveId}
            onClose={removeSession}
            onNew={() => openDialog('ssh')}
            onReorder={handleTabReorder}
            onSaveOutput={handleSaveTabOutput}
            onClearScreen={handleClearTabScreen}
            onSetBackspaceMode={handleSetBackspaceMode}
          />
          <div className="content-area">
            <div className="terminal-area">
              {sessions.length === 0
                ? <WelcomeScreen onNewSession={openDialog} />
                : sessions.map(s => (
                  <TerminalPanelSlot
                    key={s.id}
                    session={s}
                    active={s.id === activeId}
                    terminalSettings={terminalSettings as AppSettings}
                    appThemeEffective={appThemeEffective}
                    updateSession={updateSession}
                    onRegisterExport={registerTerminalExporter}
                    onRegisterClearScreen={registerTerminalClearScreen}
                  />
                ))
              }
            </div>
          </div>
        </div>
      </div>

      {showDialog && (
        <Suspense fallback={null}>
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
        </Suspense>
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
        <Suspense fallback={null}>
          <SettingsDialog
            settings={settings}
            savedSessions={savedSessions}
            onUpdateSessions={updateSaved}
            onUpdatePlaceholders={updatePlaceholders}
            onAppThemePreview={setAppThemePreview}
            onClose={() => {
              setAppThemePreview(null)
              setShowSettings(false)
            }}
            onSave={(s: AppSettings) => {
              setAppThemePreview(null)
              setSettings(s)
              void reapplyVaultPoliciesForAllSessions(savedSessions, s)
            }}
          />
        </Suspense>
      )}
    </div>
  )
}

/** 应用主组件 */
export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => {  // 加载设置，并同步 UI 语言到主进程
    const s = loadSettings()
    syncUiLanguageToMain(s.uiLanguage)
    return s
  })

  useEffect(() => {  // 监听下载路径变化，更新 logPath
    void refreshDownloadsPathCache().then(() => {
      const def = getDefaultLogPath()
      if (!def) return
      setSettings((s) => {
        const cur = s?.logPath != null ? String(s.logPath).trim() : ''
        if (cur) return s
        return { ...s, logPath: def }
      })
    })
  }, [])

  return (
    <I18nProvider language={settings.uiLanguage}>
      <SessionProvider settings={settings}>
        <AppMain settings={settings} setSettings={setSettings} />
      </SessionProvider>
    </I18nProvider>
  )
}
