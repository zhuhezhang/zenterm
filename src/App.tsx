import { useState, useCallback, useEffect, useMemo, lazy, Suspense, memo, type Dispatch, type SetStateAction } from 'react'
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

const ConnectDialog = lazy(() => import('@/components/ConnectDialog'))
const SettingsDialog = lazy(() => import('@/components/SettingsDialog'))
import { useSyncedAppTheme } from '@/hooks/useSyncedAppTheme'
import { useSidebarResize } from '@/hooks/useSidebarResize'
import { loadSettings, refreshDownloadsPathCache, getDefaultLogPath } from './store/settingsStore'
import { DEFAULT_SIDEBAR_WIDTH } from './lib/settings/defaults'
import { clampSidebarWidthPx } from './lib/settings/normalize'
import { resolveEffectiveUiLanguage, syncUiLanguageToMain } from './lib/resolveUiLanguage'
import { reapplyVaultPoliciesForAllSessions } from './store/credentialsBridge'
import './styles/app.css'

const TerminalPanelSlot = memo(function TerminalPanelSlot({
  session,
  active,
  terminalSettings,
  appThemeEffective,
  updateSession,
  onRegisterExport,
  onRegisterClearScreen,
}: {
  session: ActiveSession
  active: boolean
  terminalSettings: AppSettings
  appThemeEffective: 'dark' | 'light'
  updateSession: (id: string, upd: Partial<ActiveSession>) => void
  onRegisterExport: (sessionId: string, getter: TerminalTextGetter | null) => void
  onRegisterClearScreen: (sessionId: string, fn: TerminalClearFn | null) => void
}) {
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

/**
 * 主界面（在 I18nProvider 内，可使用 useI18n）
 * @param {{ settings: object, setSettings: function }} props
 * @param {Object} props.settings 设置
 * @param {Function} props.setSettings 设置回调函数
 * @returns {React.ReactNode} 应用主组件
 */
function AppMain({
  settings,
  setSettings,
}: {
  settings: AppSettings
  setSettings: Dispatch<SetStateAction<AppSettings>>
}) {
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
  } = useSession()

  const [appThemePreview, setAppThemePreview] = useState<AppTheme | null>(null)
  const appThemeEffective = useSyncedAppTheme(appThemePreview ?? settings.appTheme)  // ??表示如果 appThemePreview 为 null，则使用 settings.appTheme
  const terminalSettings = useMemo(() => ({
    loggingMode: settings.loggingMode,
    logPath: settings.logPath,
    terminalScrollback: settings.terminalScrollback,
    terminalInteract: settings.terminalInteract,
    highlightRules: settings.highlightRules,
    uiLanguage: settings.uiLanguage,
    algorithmPreferences: settings.algorithmPreferences,
  }), [
    settings.loggingMode,
    settings.logPath,
    settings.terminalScrollback,
    settings.terminalInteract,
    settings.highlightRules,
    settings.uiLanguage,
    settings.algorithmPreferences,
  ])

  useEffect(() => {
    const eff = resolveEffectiveUiLanguage(settings.uiLanguage)
    document.documentElement.lang = eff === 'en' ? 'en' : 'zh-CN'
    syncUiLanguageToMain(settings.uiLanguage)
  }, [settings.uiLanguage])

  const [sidebarOpen, setSidebarOpen] = useState(true)  // 侧边栏是否打开
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    clampSidebarWidthPx(settings.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH, window.innerWidth)
  )  // 侧边栏宽度（与 settings.sidebarWidth 同步；拖拽结束后写回 localStorage）
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    setSidebarWidth((cur) => {
      const w = clampSidebarWidthPx(settings.sidebarWidth, window.innerWidth)
      return w === cur ? cur : w
    })
  }, [settings.sidebarWidth])

  /**
   * 处理侧边栏分割线的拖拽事件：记录起始位置，监听鼠标移动更新宽度，鼠标释放时移除监听器
   * @param {MouseEvent} e 鼠标事件对象，包含鼠标位置等信息
   */
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

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const s = loadSettings()
    syncUiLanguageToMain(s.uiLanguage)
    return s
  })

  useEffect(() => {
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
