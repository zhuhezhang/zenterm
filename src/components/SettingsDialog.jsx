import { useState, useRef, useCallback, useEffect, Fragment } from 'react'
import { translateRender } from '../i18n/translateRender.js'
import { formatIpcResponseError } from '@/lib/ipc/formatIpcError.js'
import { resolveEffectiveUiLanguage } from '../../shared/resolveUiLanguage.js'
import { exportSessions, saveSessions } from '../store/sessionStore.js'
import { IMPORT_JSON_ACCEPT } from '../lib/import/constants.js'
import { reportSettingsImportResult, reportSettingsImportError } from '../lib/import/reportSettingsImport.js'
import { createHighlightRuleId, normalizeHighlightRulesForSave } from '../lib/settings/highlightRules.js'
import { clearAllVaultEntries, absorbPlaintextSecretsFromImportedSessions } from '../store/credentialsBridge.js'
import { DEFAULT_SETTINGS, SSH_ALGORITHM_SECTION_KEYS } from '../lib/settings/defaults.js'
import {
  DEFAULT_ALGORITHM_PREFERENCES, SSH_ALGORITHM_OPTION_POOL, isWeakSshAlgorithm,
} from '../../shared/sshAlgorithmDefaults.js'
import {
  clampTerminalScrollback, normalizeLoggingMode, applyLegacyLoggingMigration,
} from '../lib/settings/normalize.js'
import {
  SETTINGS_SCHEMA, SETTINGS_TABS, SETTINGS_TAB_SECTION_IDS, saveSettings, exportSettings, importSettings, getDefaultLogPath,
} from '../store/settingsStore.js'
import {
  applySessionsImport, reportSessionsImportResult, reportSessionsImportError, resetImportFileInput,
} from '../lib/import/applySessionsImport.js'
import { HighlightRegexIcon, HighlightCaseIcon } from './settings/HighlightRuleIcons.jsx'
import '../styles/dialog.css'
import '../styles/settings.css'

/**
 * 设置对话框组件
 * 提供应用设置的界面，包括日志路径配置和会话管理功能
 * @param {Object} props 组件属性
 * @param {Object} props.settings 当前的设置对象
 * @param {Array} props.savedSessions 已保存的会话列表
 * @param {Function} props.onUpdateSessions 更新会话列表的回调函数
 * @param {Function} props.onUpdatePlaceholders 更新分组占位符的回调函数（可选）
 * @param {Function} props.onClose 关闭对话框的回调函数
 * @param {Function} props.onSave 保存设置的回调函数，参数为新的设置对象
 * @param {Function} [props.onAppThemePreview] 应用主题预览（不写 localStorage），参数为 dark | light | auto
 */
export default function SettingsDialog({ settings, savedSessions, onUpdateSessions, onUpdatePlaceholders, onClose, onSave, onAppThemePreview }) {
  const [form, setForm] = useState({
    ...settings,
    highlightRules: settings.highlightRules ? [...settings.highlightRules] : [],
    algorithmPreferences: settings.algorithmPreferences || DEFAULT_ALGORITHM_PREFERENCES,
  })
  const msgLang = resolveEffectiveUiLanguage(form.uiLanguage ?? settings.uiLanguage ?? 'auto')
  const t = (path, params) => translateRender(msgLang, path, params)

  /** 导入设置的文件输入引用。 useRef和useState类似，但它返回一个可变的ref对象，其.current属性被初始化为传入的参数（initialValue）。返回的ref对象在组件的整个生命周期内保持不变，因此它不会触发重新渲染*/
  const importRef = useRef(null)
  /** 用于导入设置的文件输入引用 */
  const importSettingsRef = useRef(null)
  /** 设置标签页列表 */
  const tabs = SETTINGS_TABS.map((tab) => ({ key: tab.key, label: t(tab.labelKey) }))
  const [activeTab, setActiveTab] = useState('general')  // 当前选中的标签页
  const [settingsHoverTip, setSettingsHoverTip] = useState(null)  // 设置弹窗内浮动说明（原生 title 在 Electron 内不可靠，用 fixed 层统一展示）
  /** 设置悬停提示定时器引用 */
  const settingsHoverTipTimerRef = useRef(null)

  /** 隐藏设置悬停提示，清除定时器并设置状态为 null */
  const hideSettingsHoverTip = useCallback(() => {
    if (settingsHoverTipTimerRef.current != null) {
      clearTimeout(settingsHoverTipTimerRef.current)
      settingsHoverTipTimerRef.current = null
    }
    setSettingsHoverTip(null)
  }, [])

  /**
   * 悬停/聚焦满 1 秒后再显示，避免扫过界面时提示刷屏
   * @param {Event} e 事件对象
   * @param {string} text 提示文本
   */
  const showSettingsHoverTip = (e, text) => {
    if (settingsHoverTipTimerRef.current != null) {
      clearTimeout(settingsHoverTipTimerRef.current)
      settingsHoverTipTimerRef.current = null
    }
    const r = e.currentTarget.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top
    settingsHoverTipTimerRef.current = window.setTimeout(() => {
      settingsHoverTipTimerRef.current = null
      setSettingsHoverTip({ text, x, y })
    }, 1000)
  }

  useEffect(() => {  // 任意按下或点击（含键盘触发的主按钮）时关闭已显示或待显示的说明
    document.addEventListener('pointerdown', hideSettingsHoverTip, true)
    document.addEventListener('click', hideSettingsHoverTip, true)
    return () => {
      document.removeEventListener('pointerdown', hideSettingsHoverTip, true)
      document.removeEventListener('click', hideSettingsHoverTip, true)
      if (settingsHoverTipTimerRef.current != null) {
        clearTimeout(settingsHoverTipTimerRef.current)
        settingsHoverTipTimerRef.current = null
      }
    }
  }, [hideSettingsHoverTip])

  /** 创建一个新的高亮规则对象，包含唯一的 ID、启用状态、是否使用正则表达式、匹配模式和颜色 */
  const createHighlightRule = () => ({
    id: createHighlightRuleId(),
    name: '',
    enabled: true,
    useRegex: true,
    caseSensitive: false,
    pattern: '',
    color: '#ffcc00',
  })

  /** 
   * 更新高亮规则，根据规则 ID 和要更新的属性值修改表单中的高亮规则列表
   * @param {string} id 要更新的规则 ID
   * @param {Object} changes 要更新的属性和值，例如 { enabled: false } 表示禁用该规则
   */
  const updateHighlightRule = (id, changes) => {
    setForm(prev => ({
      ...prev,
      highlightRules: (prev.highlightRules || []).map(rule =>
        rule.id === id ? { ...rule, ...changes } : rule
      ),
    }))
  }

  /**
   * 添加新的高亮规则，在表单的高亮规则列表中追加一个新的规则对象
   * 新规则会被自动赋予一个唯一的 ID，默认启用，使用正则表达式，匹配模式为空，颜色为黄色
   */
  const addHighlightRule = () => {
    setForm(prev => ({
      ...prev,
      highlightRules: [...(prev.highlightRules || []), createHighlightRule()],
    }))
  }

  /**
   * 删除高亮规则，根据规则 ID 从表单的高亮规则列表中过滤掉对应的规则对象
   * @param {string} id 要删除的规则 ID
   */
  const removeHighlightRule = (id) => {
    setForm(prev => ({
      ...prev,
      highlightRules: (prev.highlightRules || []).filter(rule => rule.id !== id),
    }))
  }

  /** 将高亮规则列表恢复为应用内置默认（仅更新表单，需再点「保存」写入本地） */
  const handleResetHighlightRules = () => {
    if (!confirm(t('settings.confirmResetHighlight'))) return
    const defaults = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.highlightRules))
    setForm(prev => ({ ...prev, highlightRules: defaults }))
  }

  /**
   * 更新设置
   * @param {string} key 设置项的键
   * @param {any} value 设置项的新值
   */
  const previewAppTheme = (theme) => {
    if (typeof onAppThemePreview === 'function' && ['dark', 'light', 'auto'].includes(theme)) {
      onAppThemePreview(theme)
    }
  }

  /**
   * 更新设置，同时预览应用主题
   * @param {string} key 设置项的键
   * @param {any} value 设置项的新值
   */
  const set = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }))
    if (key === 'appTheme') previewAppTheme(value)
  }  // [key] 表示“用这个变量的值作为属性名”

  /** 算法选项列表 */
  const algorithmSections = SSH_ALGORITHM_SECTION_KEYS.map((key) => ({
    key,
    label: t(`settings.algo.${key}`),
    desc: t(`settings.algo.${key}Desc`),
  }))
  
  const [activeAlgoSection, setActiveAlgoSection] = useState('kex')  // 默认选中密钥交换算法类别

  /**
   * 切换算法选项，根据算法类别和选项值更新表单中的算法偏好设置
   * @param {string} type 算法类别，例如 'kex'、'serverHostKey'、'cipher'、'hmac'、'compress'
   * @param {string} value 要切换的算法选项值，例如 'curve25519-sha256'、'ssh-ed25519'、'aes128-gcm'、'hmac-sha2-256'、'zlib'
   */
  const toggleAlgorithmOption = (type, value) => {
    setForm(prev => {
      const selected = prev.algorithmPreferences?.[type] || []  // 获取当前选中的算法选项列表，如果没有则返回空数组
      const exists = selected.includes(value)  // 检查要切换的算法选项是否已经选中
      const next = exists ? selected.filter(item => item !== value) : [...selected, value]  // 如果已经选中，则移除该选项，否则添加该选项
      return {
        ...prev,  // 复制当前表单数据
        algorithmPreferences: {
          ...prev.algorithmPreferences,  // 复制当前算法偏好设置
          [type]: next,
        },  // 更新指定算法类别的选项列表
      }
    })
  }

  /**
   * 移动算法选项，根据算法类别和选项值更新表单中的算法偏好设置
   * @param {string} type 算法类别，例如 'kex'、'serverHostKey'、'cipher'、'hmac'、'compress'
   * @param {string} value 要移动的算法选项值，例如 'curve25519-sha256'、'ssh-ed25519'、'aes128-gcm'、'hmac-sha2-256'、'zlib'
   * @param {number} direction 移动方向，-1 表示向上移动，1 表示向下移动
   */
  const moveAlgorithmOption = (type, value, direction) => {
    setForm(prev => {
      const selected = prev.algorithmPreferences?.[type] || []  // 获取当前选中的算法选项列表，如果没有则返回空数组
      const index = selected.indexOf(value)  // 获取要移动的算法选项在列表中的索引
      if (index < 0) return prev  // 如果索引小于0，则返回当前表单数据
      const nextIndex = index + direction  // 计算移动后的索引
      if (nextIndex < 0 || nextIndex >= selected.length) return prev  // 如果移动后的索引小于0或大于等于列表长度，则返回当前表单数据
      const next = [...selected]
      ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]  // 交换两个索引位置的值
      return {
        ...prev,
        algorithmPreferences: {
          ...prev.algorithmPreferences,
          [type]: next,
        },
      }
    })
  }

  /** 重置算法偏好设置，将表单中的算法偏好设置恢复为默认值 */
  const resetAlgorithmPreferences = () => set('algorithmPreferences', DEFAULT_ALGORITHM_PREFERENCES)

  /** 仅将某一算法类别恢复为内置默认顺序与勾选集合 */
  const resetAlgorithmSection = (type) => {
    const defaults = DEFAULT_ALGORITHM_PREFERENCES[type]
    if (!defaults) return
    setForm(prev => ({
      ...prev,
      algorithmPreferences: {
        ...prev.algorithmPreferences,
        [type]: [...defaults],
      },
    }))
  }

  /** 处理保存设置的操作，将当前表单数据保存到设置中，并调用 onSave 回调函数传递新的设置对象 */
  const handleSave = () => {
    const next = applyLegacyLoggingMigration({
      ...form,
      highlightRules: normalizeHighlightRulesForSave(form.highlightRules, msgLang),
      terminalScrollback: clampTerminalScrollback(form.terminalScrollback),
      loggingMode: normalizeLoggingMode(form.loggingMode),
    })
    setForm(next)
    saveSettings(next)
    onSave(next)
  }

  /** 保存设置后关闭对话框 */
  const handleSaveAndClose = () => {
    const next = applyLegacyLoggingMigration({
      ...form,
      highlightRules: normalizeHighlightRulesForSave(form.highlightRules, msgLang),
      terminalScrollback: clampTerminalScrollback(form.terminalScrollback),
      loggingMode: normalizeLoggingMode(form.loggingMode),
    })
    setForm(next)
    saveSettings(next)
    onSave(next)
    onClose()
  }

  /** 处理导出会话的操作，将当前的 savedSessions 导出为 JSON 文件 */
  const handleExport = () => exportSessions(savedSessions)

  /** 处理导入会话的操作，触发文件选择对话框，选择 JSON 文件后将其内容导入并与现有会话合并，最后更新会话列表 */
  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await applySessionsImport(
        file,
        savedSessions,
        absorbPlaintextSecretsFromImportedSessions,
      )
      onUpdateSessions(result.sessions)
      reportSessionsImportResult(t, result)
    } catch (err) {
      reportSessionsImportError(t, err)
    }
    resetImportFileInput(e)
  }

  /** 处理清除所有会话的操作，弹出两次确认对话框，确认后清除所有保存的会话和分组占位符，并更新会话列表和占位符列表 */
  const handleClearAll = () => {
    if (!confirm(t('settings.confirmClearSessions'))) return
    if (!confirm(t('settings.confirmClearSessions2'))) return
    void clearAllVaultEntries()
    onUpdateSessions([])
    saveSessions([])
    onUpdatePlaceholders?.([])  // 同时清除所有分组占位符
    alert(t('settings.clearedSessions'))
  }

  /** 处理导出设置的操作，将当前设置导出为 JSON 文件 */
  const handleExportSettings = () => exportSettings(form)

  /** 处理导入设置的操作，从 JSON 文件导入设置并更新表单 */
  const handleImportSettings = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const { settings: importedSettings, warnings } = await importSettings(file, form)
      setForm({
        ...importedSettings,
        highlightRules: [...importedSettings.highlightRules],
        algorithmPreferences: { ...importedSettings.algorithmPreferences },
      })
      previewAppTheme(importedSettings.appTheme)
      reportSettingsImportResult(t, warnings)
    } catch (err) {
      reportSettingsImportError(t, err)
    }
    resetImportFileInput(e)
  }

  /** 将所有设置恢复为内置默认值；二次确认后立即写入本地并同步到应用 */
  const handleRestoreDefaultSettings = () => {
    if (!confirm(t('settings.confirmRestore'))) return
    if (!confirm(t('settings.confirmRestore2'))) return
    const next = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
    setForm(next)
    previewAppTheme(next.appTheme)
    saveSettings(next)
    onSave(next)
    alert(t('settings.restored'))
  }

  /** 
   * 选择目录后主进程校验路径（与 log:write 一致）；不允许则提示且不写入表单
   * @param {string} rawPath 原始路径
   * @returns {Promise<void>}
   */
  const applyChosenLogPath = async (rawPath) => {
    const p = String(rawPath ?? '').trim()
    if (!p) return
    const likelyAbsolute =
      p.startsWith('/') ||
      p.startsWith('\\') ||
      /^[a-zA-Z]:[\\/]/.test(p)
    try {
      if (window.zterm?.validateLogDirectory && likelyAbsolute) {
        const vr = await window.zterm.validateLogDirectory(p)
        if (!vr?.ok) {
          alert(formatIpcResponseError(t, vr) || t('settings.logPathRejected'))
          return
        }
      }
      set('logPath', p)
    } catch (err) {
      alert(t('settings.logPathValidateFail', { msg: err?.message ?? String(err) }))
    }
  }

  /** 处理选择日志路径的操作，兼容使用不同的 API 弹出目录选择对话框，选择后更新日志路径设置 */
  const handleChooseLogPath = async () => {
    try {
      if (window.zterm?.chooseDirectory) {
        const picked = await window.zterm.chooseDirectory()
        if (picked) await applyChosenLogPath(picked)
      } else if (window.showDirectoryPicker) {
        const dir = await window.showDirectoryPicker()
        await applyChosenLogPath(dir.name)
      } else {
        const el = document.createElement('input')
        el.type = 'file'
        el.webkitdirectory = true
        el.onchange = async () => {
          const f = el.files?.[0]
          if (!f) return
          const diskPath =
            typeof window.zterm?.getPathForFile === 'function'
              ? window.zterm.getPathForFile(f)
              : (typeof f.path === 'string' ? f.path : '')
          if (!diskPath) return
          const dirPath = diskPath.replace(/[/\\][^/\\]*$/, '')
          await applyChosenLogPath(dirPath)
        }
        el.click()
      }
    } catch (_) {}
  }

  /** 处理重置日志路径的操作，将日志路径设置恢复为默认值 */
  const handleResetLogPath = () => set('logPath', '')

  /** 清空主进程加密库中的全部敏感凭据（不删除已保存会话条目） */
  const handleClearAllVaultSecrets = async () => {
    if (!confirm(t('settings.confirmClearVault'))) return
    if (!confirm(t('settings.confirmClearVault2'))) return
    try {
      await clearAllVaultEntries()
      alert(t('settings.clearedVault'))
    } catch (e) {
      alert(t('settings.clearVaultFail', { msg: e?.message || String(e) }))
    }
  }

  /** 设置操作按钮回调函数 */
  const settingsActions = {
    resetAlgorithmPreferences,  // 重置算法偏好设置
    resetHighlightRules: handleResetHighlightRules,  // 重置高亮规则
    addHighlightRule,  // 添加高亮规则
    clearVault: handleClearAllVaultSecrets,  // 清除加密库中的全部敏感凭据
    exportSessions: handleExport,  // 导出会话
    importSessions: () => importRef.current?.click(),  // 导入会话
    clearAllSessions: handleClearAll,  // 清除所有会话
    exportSettings: handleExportSettings,  // 导出设置
    importSettings: () => importSettingsRef.current?.click(),  // 导入设置
    restoreDefaultSettings: handleRestoreDefaultSettings,  // 恢复默认设置
  }

  /** 
   * 渲染设置项
   * @param {Object} item 设置项对象
   * @returns {React.ReactNode} 渲染后的设置项 
   */
  const renderSettingItem = (item) => {
    /** 设置项的键或操作名，如 'terminalScrollback'、'logPath'、'resetAlgorithmPreferences'、'resetHighlightRules'等 */
    const itemKey = item.key || item.action
    /** 设置项的标签，如 '终端滚动缓冲区'、'日志路径'、'重置算法偏好设置'、'重置高亮规则'等 */
    const label = item.labelKey ? t(item.labelKey) : t(`settings.fields.${item.key}.label`)
    /** 设置项的描述，如 '终端滚动缓冲区'、'日志路径'、'重置算法偏好设置'、'重置高亮规则'等 */
    const desc = item.descKey ? t(item.descKey) : (item.key ? t(`settings.fields.${item.key}.desc`) : '')
    /** 日志路径的显示值，如 '~/Downloads/zterm-session-log'、'~/Downloads/zterm-session-log'、'系统下载目录（默认）'等 */
    const logDisplay = form[item.key] || getDefaultLogPath() || t('settings.logDefaultDir')
    /** 日志路径的提示路径，如 '~/Downloads/zterm-session-log'、'~/Downloads/zterm-session-log'、'系统下载目录（默认）'等 */
    const logTipPath = form[item.key] || getDefaultLogPath() || t('settings.logDefaultDir')
    /** 重置日志路径的提示文本，如 '恢复默认日志目录为：\n~/Downloads/zterm-session-log'等 */
    const logResetTip = t('settings.logResetDefault', { path: getDefaultLogPath() || t('settings.logDefaultDir') })
    /** 日志路径是否禁用，如 true、false等 */
    const logPathDisabled = item.key === 'logPath' && normalizeLoggingMode(form.loggingMode) === 'none'

    return (
      <div key={itemKey} className="settings-item">
        <div className="settings-item-info">
          <span className="settings-item-label">{label}</span>
          {desc ? <span className="settings-item-desc">{desc}</span> : null}
        </div>
        {item.type === 'boolean' && (
          <button
            type="button"
            className={`settings-toggle ${form[item.key] ? 'on' : 'off'}`}
            onClick={() => set(item.key, !form[item.key])}
          >
            <span className="settings-toggle-knob" />
          </button>
        )}
        {item.type === 'action' && (
          <>
            <button
              type="button"
              className={`settings-action-btn${item.danger ? ' danger' : ''}`}
              onClick={() => settingsActions[item.action]?.()}
            >
              {t(item.buttonKey)}
            </button>
            {item.fileInput === 'importSessions' && (
              <input ref={importRef} type="file" accept={IMPORT_JSON_ACCEPT} style={{ display: 'none' }} onChange={handleImport} />
            )}
            {item.fileInput === 'importSettings' && (
              <input ref={importSettingsRef} type="file" accept={IMPORT_JSON_ACCEPT} style={{ display: 'none' }} onChange={handleImportSettings} />
            )}
          </>
        )}
        {item.type === 'path' && (
          <div
            className={`settings-path-row${logPathDisabled ? ' is-log-path-disabled' : ''}`}
            onMouseEnter={logPathDisabled ? (e) => showSettingsHoverTip(e, t('settings.logPathDisabledTip')) : undefined}
            onMouseLeave={logPathDisabled ? hideSettingsHoverTip : undefined}
          >
            <input
              className="settings-path-input"
              value={logDisplay}
              placeholder={getDefaultLogPath() || t('settings.logChooseDir')}
              readOnly
              disabled={logPathDisabled}
              aria-label={label}
              onMouseEnter={logPathDisabled ? undefined : (e) => showSettingsHoverTip(e, t('settings.logCurrentDir', { path: logTipPath }))}
              onMouseLeave={logPathDisabled ? undefined : hideSettingsHoverTip}
              onFocus={logPathDisabled ? undefined : (e) => showSettingsHoverTip(e, t('settings.logCurrentDir', { path: logTipPath }))}
              onBlur={logPathDisabled ? undefined : hideSettingsHoverTip}
            />
            <button type="button" className="settings-path-btn" disabled={logPathDisabled} onClick={handleChooseLogPath}>{t('settings.choose')}</button>
            <button
              type="button"
              className="settings-path-btn reset"
              aria-label={t('settings.logResetAria')}
              disabled={logPathDisabled}
              onClick={handleResetLogPath}
              onMouseEnter={logPathDisabled ? undefined : (e) => showSettingsHoverTip(e, logResetTip)}
              onMouseLeave={logPathDisabled ? undefined : hideSettingsHoverTip}
              onFocus={logPathDisabled ? undefined : (e) => showSettingsHoverTip(e, logResetTip)}
              onBlur={logPathDisabled ? undefined : hideSettingsHoverTip}
            >
              ↺
            </button>
          </div>
        )}
        {item.type === 'select' && (
          <select
            className="settings-select"
            value={form[item.key] ?? item.options?.[0]?.value ?? ''}
            onChange={(e) => set(item.key, e.target.value)}
          >
            {(item.options || []).map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.labelKey ? t(opt.labelKey) : (opt.label ?? opt.value)}</option>
            ))}
          </select>
        )}
        {item.type === 'number' && (
          <input
            type="number"
            className="settings-number-input"
            min={item.min ?? 0}
            max={item.max}
            step={item.step ?? 1}
            value={form[item.key] ?? ''}
            aria-label={label}
            onChange={(e) => {
              const v = e.target.value
              if (v === '' || v === '-') {
                set(item.key, v)
                return
              }
              const n = Number(v)
              if (!Number.isFinite(n)) return
              set(item.key, n)
            }}
            onBlur={() => set(item.key, clampTerminalScrollback(form[item.key]))}
            title=""
          />
        )}
      </div>
    )
  }

  /** 
   * 渲染区块标题
   * @param {Object} header 区块标题对象
   * @returns {React.ReactNode} 渲染后的区块标题 
   */
  const renderSectionHeader = (header) => {
    if (!header) return null
    const actions = header.actions || []  // 区块标题的操作按钮列表，如 [ { action: 'resetAlgorithmPreferences', buttonKey: 'settings.resetDefault' } ] 即重置算法偏好设置
    return (
      <div className="settings-item">
        <div className="settings-item-info">
          <span className="settings-item-label">{t(header.labelKey)}</span>
          {header.descKey ? <span className="settings-item-desc">{t(header.descKey)}</span> : null}
        </div>
        {actions.length > 1 ? (
          <div className="settings-item-actions">
            {actions.map((act) => (
              <button
                key={act.action}
                type="button"
                className="settings-action-btn"
                onClick={() => settingsActions[act.action]?.()}
              >
                {t(act.buttonKey)}
              </button>
            ))}
          </div>
        ) : actions.length === 1 ? (
          <button
            type="button"
            className="settings-action-btn"
            onClick={() => settingsActions[actions[0].action]?.()}
          >
            {t(actions[0].buttonKey)}
          </button>
        ) : null}
      </div>
    )
  }

  /** 
   * 渲染算法区块
   * @param {Object} sectionDef 算法区块定义
   * @returns {React.ReactNode} 渲染后的算法区块 
   */
  const renderAlgorithmSection = (sectionDef) => {
    const algoCategory = algorithmSections.find((item) => item.key === activeAlgoSection) || algorithmSections[0]
    const selected = form.algorithmPreferences?.[algoCategory.key] || []
    const options = SSH_ALGORITHM_OPTION_POOL[algoCategory.key] || []
    return (
      <div className="settings-section">
        <div className="settings-section-title">{t(`settings.sections.${sectionDef.section}`)}</div>
        <div className="settings-items">
          {renderSectionHeader(sectionDef.header)}
          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">{t('settings.algoCategory')}</span>
              <span className="settings-item-desc">{t('settings.algoCategoryDesc')}</span>
            </div>
            <select className="settings-select" value={activeAlgoSection} onChange={(e) => setActiveAlgoSection(e.target.value)}>
              {algorithmSections.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
          </div>
          <div className="settings-algo-block">
            <div className="settings-algo-desc">
              <div className="settings-item-info">
                <span className="settings-item-desc">{algoCategory.desc}</span>
              </div>
              <button type="button" className="settings-action-btn" onClick={() => resetAlgorithmSection(algoCategory.key)}>
                {t('settings.resetSection')}
              </button>
            </div>
            {selected.map((value, index) => (
              <div key={value} className="settings-algo-row">
                <label className="settings-algo-label">
                  <input type="checkbox" checked onChange={() => toggleAlgorithmOption(algoCategory.key, value)} />
                  <span>{value}</span>
                  {isWeakSshAlgorithm(algoCategory.key, value) && (
                    <span
                      className="settings-algo-weak-badge"
                      onMouseEnter={(e) => showSettingsHoverTip(e, t('settings.weakTip'))}
                      onMouseLeave={hideSettingsHoverTip}
                    >
                      {t('settings.weakBadge')}
                    </span>
                  )}
                </label>
                <div className="settings-algo-actions">
                  <button className="settings-algo-btn" type="button" disabled={index <= 0} onClick={() => moveAlgorithmOption(algoCategory.key, value, -1)}>↑</button>
                  <button className="settings-algo-btn" type="button" disabled={index === selected.length - 1} onClick={() => moveAlgorithmOption(algoCategory.key, value, 1)}>↓</button>
                </div>
              </div>
            ))}
            {options.filter((value) => !selected.includes(value)).map((value) => (
              <div key={value} className="settings-algo-row">
                <label className="settings-algo-label">
                  <input type="checkbox" checked={false} onChange={() => toggleAlgorithmOption(algoCategory.key, value)} />
                  <span>{value}</span>
                  {isWeakSshAlgorithm(algoCategory.key, value) && (
                    <span
                      className="settings-algo-weak-badge"
                      onMouseEnter={(e) => showSettingsHoverTip(e, t('settings.weakTip'))}
                      onMouseLeave={hideSettingsHoverTip}
                    >
                      {t('settings.weakBadge')}
                    </span>
                  )}
                </label>
                <div className="settings-algo-actions">
                  <button className="settings-algo-btn" type="button" disabled>↑</button>
                  <button className="settings-algo-btn" type="button" disabled>↓</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  /** 
   * 渲染高亮区块
   * @param {Object} sectionDef 高亮区块定义
   * @returns {React.ReactNode} 渲染后的高亮区块 
   */
  const renderHighlightSection = (sectionDef) => (
    <div className="settings-section">
      <div className="settings-section-title">{t(`settings.sections.${sectionDef.section}`)}</div>
      <div className="settings-items">
        {renderSectionHeader(sectionDef.header)}
        {(form.highlightRules || []).map((rule, idx) => {
          const unnamed = translateRender(msgLang, 'settings.unnamedRule', { n: idx + 1 })
          return (
            <div key={rule.id} className="settings-rule-item">
              <div className="settings-rule-top">
                <span className="settings-rule-index">{t('settings.ruleN', { n: idx + 1 })}</span>
                <input
                  className="settings-rule-name-input"
                  type="text"
                  value={rule.name ?? ''}
                  placeholder={t('settings.ruleNamePh')}
                  aria-label={t('settings.ruleNameTip')}
                  onMouseEnter={(e) => showSettingsHoverTip(e, t('settings.ruleNameTip'))}
                  onMouseLeave={hideSettingsHoverTip}
                  onChange={(e) => updateHighlightRule(rule.id, { name: e.target.value })}
                />
                <span className="settings-rule-grid-placeholder" aria-hidden="true" />
                <button
                  type="button"
                  className={`settings-toggle ${rule.enabled ? 'on' : 'off'}`}
                  aria-label={`${(rule.name || '').trim() || unnamed}：${rule.enabled ? t('settings.ruleEnabled') : t('settings.ruleDisabled')}`}
                  onMouseEnter={(e) => showSettingsHoverTip(e, rule.enabled ? t('settings.ruleEnabled') : t('settings.ruleDisabled'))}
                  onMouseLeave={hideSettingsHoverTip}
                  onFocus={(e) => showSettingsHoverTip(e, rule.enabled ? t('settings.ruleEnabled') : t('settings.ruleDisabled'))}
                  onBlur={hideSettingsHoverTip}
                  onClick={() => updateHighlightRule(rule.id, { enabled: !rule.enabled })}
                >
                  <span className="settings-toggle-knob" />
                </button>
              </div>
              <div className="settings-rule-row">
                <button type="button" className="settings-action-btn danger" onClick={() => removeHighlightRule(rule.id)}>{t('settings.delete')}</button>
                <input
                  className="settings-rule-pattern"
                  type="text"
                  value={rule.pattern}
                  placeholder={t('settings.patternPh')}
                  onMouseEnter={(e) => showSettingsHoverTip(e, t('settings.patternTip'))}
                  onMouseLeave={hideSettingsHoverTip}
                  onChange={(e) => updateHighlightRule(rule.id, { pattern: e.target.value })}
                />
                <input
                  className="settings-rule-color"
                  type="color"
                  value={rule.color || '#ffcc00'}
                  aria-label={t('settings.colorTip')}
                  onMouseEnter={(e) => showSettingsHoverTip(e, t('settings.colorTip'))}
                  onMouseLeave={hideSettingsHoverTip}
                  onFocus={(e) => showSettingsHoverTip(e, t('settings.colorTip'))}
                  onBlur={hideSettingsHoverTip}
                  onChange={(e) => updateHighlightRule(rule.id, { color: e.target.value })}
                />
                <div className="settings-rule-icon-toggles" role="group" aria-label={t('settings.matchOptions')}>
                  <button
                    type="button"
                    className={`settings-icon-toggle ${rule.caseSensitive === true ? 'active' : ''}`}
                    aria-label={t('settings.caseAria')}
                    aria-pressed={rule.caseSensitive === true}
                    onMouseEnter={(e) => showSettingsHoverTip(e, rule.caseSensitive === true ? t('settings.caseTipOn') : t('settings.caseTipOff'))}
                    onMouseLeave={hideSettingsHoverTip}
                    onFocus={(e) => showSettingsHoverTip(e, rule.caseSensitive === true ? t('settings.caseTipOn') : t('settings.caseTipOff'))}
                    onBlur={hideSettingsHoverTip}
                    onClick={() => updateHighlightRule(rule.id, { caseSensitive: !rule.caseSensitive })}
                  >
                    <HighlightCaseIcon />
                  </button>
                  <button
                    type="button"
                    className={`settings-icon-toggle ${(rule.useRegex ?? true) ? 'active' : ''}`}
                    aria-label={t('settings.regexAria')}
                    aria-pressed={rule.useRegex ?? true}
                    onMouseEnter={(e) => showSettingsHoverTip(e, (rule.useRegex ?? true) ? t('settings.regexTipOn') : t('settings.regexTipOff'))}
                    onMouseLeave={hideSettingsHoverTip}
                    onFocus={(e) => showSettingsHoverTip(e, (rule.useRegex ?? true) ? t('settings.regexTipOn') : t('settings.regexTipOff'))}
                    onBlur={hideSettingsHoverTip}
                    onClick={() => updateHighlightRule(rule.id, { useRegex: !(rule.useRegex ?? true) })}
                  >
                    <HighlightRegexIcon />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  /** 
   * 渲染设置区块
   * @param {Object} sectionDef 设置区块定义
   * @returns {React.ReactNode} 渲染后的设置区块 
   */
  const renderSection = (sectionDef) => {
    if (sectionDef.kind === 'algorithm') return renderAlgorithmSection(sectionDef)  // 渲染算法区块
    if (sectionDef.kind === 'highlight') return renderHighlightSection(sectionDef)  // 渲染高亮区块
    return (
      <div key={sectionDef.section} className="settings-section">
        <div className="settings-section-title">{t(`settings.sections.${sectionDef.section}`)}</div>
        <div className="settings-items">
          {(sectionDef.items || []).map((item) => renderSettingItem(item))}
        </div>
      </div>
    )
  }


  return (
    <div className="dialog-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      {settingsHoverTip && (
        <div
          className="settings-hover-tip"
          role="tooltip"
          style={{ left: settingsHoverTip.x, top: settingsHoverTip.y }}
        >
          {settingsHoverTip.text}
        </div>
      )}
      <div className="dialog settings-dialog">
        <div className="dialog-header">
          <div className="settings-title"><span className="settings-title-icon">⚙ </span>{t('settings.title')}</div>
          <button className="dialog-close" onClick={onClose}>×</button>
        </div>

        <div className="settings-body" onScroll={hideSettingsHoverTip}>
          <div className="dialog-tabs settings-dialog-tabs">
            {tabs.map(tab => (
              <button
                key={tab.key}
                type="button"
                className={`dialog-tab ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="settings-tab-panels">
            {(SETTINGS_TAB_SECTION_IDS[activeTab] || []).map((id) => {
              const section = SETTINGS_SCHEMA.find((s) => s.section === id)
              return section ? <Fragment key={id}>{renderSection(section)}</Fragment> : null
            })}
          </div>
        </div>

        <div className="dialog-footer">
          <button type="button" className="btn-cancel" onClick={onClose}>{t('settings.cancel')}</button>
          <button type="button" className="btn-save" onClick={handleSave}>{t('settings.save')}</button>
          <button type="button" className="btn-save-connect" onClick={handleSaveAndClose}>{t('settings.saveClose')}</button>
        </div>
      </div>
    </div>
  )
}
