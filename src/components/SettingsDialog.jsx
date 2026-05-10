import { useState, useRef, useCallback, useEffect, Fragment } from 'react'
import {
  SETTINGS_SCHEMA, saveSettings, exportSettings, importSettings, DEFAULT_LOG_PATH,
  DEFAULT_SETTINGS, DEFAULT_ALGORITHM_PREFERENCES, SSH_ALGORITHM_OPTION_POOL, isWeakSshAlgorithm,
} from '../store/settingsStore.js'
import { exportSessions, importSessions, saveSessions } from '../store/sessionStore.js'
import { clearAllVaultEntries, absorbPlaintextSecretsFromImportedSessions } from '../store/credentialsBridge.js'
import '../styles/dialog.css'
import '../styles/settings.css'

/** 保存前：规则名为空则按顺序设为「未命名规则1」… */
function normalizeHighlightRulesForSave(rules) {
  return (rules || []).map((rule, i) => {
    const name = String(rule?.name ?? '').trim()
    return { ...rule, name: name || `未命名规则${i + 1}` }
  })
}

/** 高亮规则：正则模式（.* 字形图标） */
function HighlightRegexIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <text
        x="12"
        y="17.5"
        textAnchor="middle"
        fill="currentColor"
        fontSize="17px"
      >
        .*
      </text>
    </svg>
  )
}

/** 高亮规则：区分大小写（Aa 字形图标） */
function HighlightCaseIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <text
        x="12"
        y="17.5"
        textAnchor="middle"
        fill="currentColor"
        fontSize="11px"
      >
        Aa
      </text>
    </svg>
  )
}

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
 */
export default function SettingsDialog({ settings, savedSessions, onUpdateSessions, onUpdatePlaceholders, onClose, onSave }) {
  const [form, setForm] = useState({
    ...settings,
    highlightRules: settings.highlightRules ? [...settings.highlightRules] : [],
    algorithmPreferences: settings.algorithmPreferences || DEFAULT_ALGORITHM_PREFERENCES,
  })
  const importRef = useRef(null)  // 和useState类似，但它返回一个可变的ref对象，其.current属性被初始化为传入的参数（initialValue）。返回的ref对象在组件的整个生命周期内保持不变，因此它不会触发重新渲染
  const importSettingsRef = useRef(null)  // 用于导入设置的文件输入引用
  /** 合并后的标签页：常规 / SSH 与终端 / 数据与安全（功能与原先 7 个 tab 一致） */
  const GENERAL_SECTION_KEYS = ['操作确认', '终端行为', '日志']
  const tabs = [
    { key: 'general', label: '常规' },
    { key: 'ssh-terminal', label: 'SSH 与终端' },
    { key: 'data-security', label: '数据与安全' },
  ]
  const [activeTab, setActiveTab] = useState('general')
  const [settingsHoverTip, setSettingsHoverTip] = useState(null)  // 设置弹窗内浮动说明（原生 title 在 Electron 内不可靠，用 fixed 层统一展示）
  const settingsHoverTipTimerRef = useRef(null)  // 设置悬停提示定时器引用

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

  /** 任意按下或点击（含键盘触发的主按钮）时关闭已显示或待显示的说明 */
  useEffect(() => {
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
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
    if (!confirm('确定将高亮规则重置为内置默认列表吗？\n当前列表中的规则会被全部替换；重置后请点击「保存」或「保存并关闭」写入本地。')) return
    const defaults = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.highlightRules))
    setForm(prev => ({ ...prev, highlightRules: defaults }))
  }

  /**
   * 更新设置
   * @param {string} key 设置项的键
   * @param {any} value 设置项的新值
   */
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))  // [key] 表示“用这个变量的值作为属性名”

  /** 算法类别列表 */
  const algorithmSections = [
    { key: 'kex', label: '密钥交换 (kex)', desc: '用于协商 SSH 连接的密钥交换算法' },
    { key: 'serverHostKey', label: '主机密钥 (serverHostKey)', desc: '用于验证服务器身份的主机密钥算法' },
    { key: 'cipher', label: '加密算法 (cipher)', desc: '用于加密传输数据的对称加密算法' },
    { key: 'hmac', label: '消息认证码 (hmac)', desc: '用于验证 SSH 数据完整性的哈希算法' },
    { key: 'compress', label: '压缩算法 (compress)', desc: '用于 SSH 连接压缩传输数据的算法' },
  ]
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

  /**
   * 渲染算法标签页的内容，根据当前选中的算法类别显示对应的算法选项列表
   * @returns {JSX.Element} 渲染后的算法标签页内容
   */
  const renderAlgorithmTab = () => {
    const section = algorithmSections.find(item => item.key === activeAlgoSection) || algorithmSections[0]  // 获取当前选中的算法类别，如果没有则使用第一个算法类别
    const selected = form.algorithmPreferences?.[section.key] || []  // 获取当前选中的算法选项列表，如果没有则返回空数组
    const options = SSH_ALGORITHM_OPTION_POOL[section.key] || []  // 可选全集（含遗留算法）；默认套件见 DEFAULT_ALGORITHM_PREFERENCES
    return (
      <div className="settings-section">
        <div className="settings-section-title">SSH/SFTP 算法</div>
        <div className="settings-items">
          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">SSH/SFTP 算法</span>
              <span className="settings-item-desc">默认仅启用现代算法；若须连接老旧设备，可在下方勾选标记为「遗留」的算法（会降低协商强度）</span>
            </div>
            <button className="settings-action-btn" onClick={resetAlgorithmPreferences}>重置默认</button>
          </div>
          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">算法类别</span>
              <span className="settings-item-desc">先从下拉列表中选择要配置的算法类别</span>
            </div>
            <select className="settings-select" value={activeAlgoSection} onChange={(e) => setActiveAlgoSection(e.target.value)}>
              {algorithmSections.map(item => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
          </div>
          <div className="settings-algo-block">
            <div className="settings-algo-desc">
              <div className="settings-item-info">
                <span className="settings-item-desc">{section.desc}</span>
              </div>
              <button
                type="button"
                className="settings-action-btn"
                onClick={() => resetAlgorithmSection(section.key)}
              >
                重置本类默认
              </button>
            </div>
            {selected.map((value, index) => (
              <div key={value} className="settings-algo-row">
                <label className="settings-algo-label">
                  <input
                    type="checkbox"
                    checked={true}
                    onChange={() => toggleAlgorithmOption(section.key, value)}
                  />
                  <span>{value}</span>
                  {isWeakSshAlgorithm(section.key, value) && (
                    <span
                      className="settings-algo-weak-badge"
                      onMouseEnter={(e) => showSettingsHoverTip(e, '遗留或较弱的算法，可能存在安全风险，仅在为兼容老旧 SSH 服务端时启用')}
                      onMouseLeave={hideSettingsHoverTip}
                    >
                      不安全
                    </span>
                  )}
                </label>
                <div className="settings-algo-actions">
                  <button
                    className="settings-algo-btn"
                    type="button"
                    disabled={index <= 0}
                    onClick={() => moveAlgorithmOption(section.key, value, -1)}
                  >↑</button>
                  <button
                    className="settings-algo-btn"
                    type="button"
                    disabled={index === selected.length - 1}
                    onClick={() => moveAlgorithmOption(section.key, value, 1)}
                  >↓</button>
                </div>
              </div>
            ))}
            {options.filter(value => !selected.includes(value)).map(value => (
              <div key={value} className="settings-algo-row">
                <label className="settings-algo-label">
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => toggleAlgorithmOption(section.key, value)}
                  />
                  <span>{value}</span>
                  {isWeakSshAlgorithm(section.key, value) && (
                    <span
                      className="settings-algo-weak-badge"
                      onMouseEnter={(e) => showSettingsHoverTip(e, '遗留或较弱的算法，可能存在安全风险，仅在为兼容老旧 SSH 服务端时启用')}
                      onMouseLeave={hideSettingsHoverTip}
                    >
                      不安全
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

  /** 处理保存设置的操作，将当前表单数据保存到设置中，并调用 onSave 回调函数传递新的设置对象 */
  const handleSave = () => {
    const next = { ...form, highlightRules: normalizeHighlightRulesForSave(form.highlightRules) }
    setForm(next)
    saveSettings(next)
    onSave(next)
  }

  /** 保存设置后关闭对话框 */
  const handleSaveAndClose = () => {
    const next = { ...form, highlightRules: normalizeHighlightRulesForSave(form.highlightRules) }
    setForm(next)
    saveSettings(next)
    onSave(next)
    onClose()
  }

  /** 处理导出会话的操作，将当前的 savedSessions 导出为 JSON 文件 */
  const handleExport = () => exportSessions(savedSessions)

  /** 处理导入会话的操作，触发文件选择对话框，选择 JSON 文件后将其内容导入并与现有会话合并，最后更新会话列表 */
  const handleImport = async (e) => {
    const file = e.target.files[0]; if (!file) return
    try {
      const beforeCount = savedSessions.length
      const imported = await importSessions(file)
      const merged = [...savedSessions]
      imported.forEach(s => { if (!merged.find(m => m.savedId === s.savedId) && !merged.find(m => m.label === s.label)) merged.push(s) })
      const sanitized = await absorbPlaintextSecretsFromImportedSessions(merged)
      onUpdateSessions(sanitized)
      alert(`已导入 ${sanitized.length - beforeCount} 个新会话，相同 ID 或名称的会话已被忽略`)
    } catch (err) { alert('导入失败：' + err.message) }
    e.target.value = ''
  }

  /** 处理清除所有会话的操作，弹出两次确认对话框，确认后清除所有保存的会话和分组占位符，并更新会话列表和占位符列表 */
  const handleClearAll = () => {
    if (!confirm('确定要清除所有保存的会话和分组吗？\n此操作不可恢复！')) return
    if (!confirm('再次确认：将删除全部会话数据，确定继续？')) return
    void clearAllVaultEntries()
    onUpdateSessions([])
    saveSessions([])
    onUpdatePlaceholders?.([])  // 同时清除所有分组占位符
    alert('已清除所有会话和分组')
  }

  /** 处理导出设置的操作，将当前设置导出为 JSON 文件 */
  const handleExportSettings = () => exportSettings(form)

  /** 处理导入设置的操作，从 JSON 文件导入设置并更新表单 */
  const handleImportSettings = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const importedSettings = await importSettings(file)
      setForm({
        ...importedSettings,
        highlightRules: importedSettings.highlightRules ? [...importedSettings.highlightRules] : [],
        algorithmPreferences: importedSettings.algorithmPreferences || DEFAULT_ALGORITHM_PREFERENCES,
      })  // 更新表单状态
      alert('设置已导入，请点击"保存"按钮应用更改')
    } catch (err) {
      alert('导入失败：' + err.message)
    }
    e.target.value = ''  // 重置文件输入
  }

  /** 将所有设置恢复为内置默认值；二次确认后立即写入本地并同步到应用 */
  const handleRestoreDefaultSettings = () => {
    if (!confirm('确定将所有本地设置恢复为默认值吗？\n终端高亮规则、SSH 算法偏好、日志路径、确认选项、凭据存储开关与存储的密钥等都会重置，此操作不可撤销。')) return
    if (!confirm('再次确认：将立即把默认设置写入本机存储并生效，是否继续？')) return
    const next = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
    setForm(next)
    saveSettings(next)
    onSave(next)
    alert('已恢复为默认设置')
  }

  /** 处理选择日志路径的操作，兼容使用不同的 API 弹出目录选择对话框，选择后更新日志路径设置 */
  const handleChooseLogPath = async () => {
    try {
      if (window.zterm?.chooseDirectory) {
        const p = await window.zterm.chooseDirectory()
        if (p) set('logPath', p)
      } else if (window.showDirectoryPicker) {
        const dir = await window.showDirectoryPicker()
        set('logPath', dir.name)
      } else {
        const el = document.createElement('input')
        el.type = 'file'
        el.webkitdirectory = true
        el.onchange = () => {
          if (el.files[0]) set('logPath', el.files[0].path.replace(/[^/\\]*$/, ''))
        }
        el.click()
      }
    } catch (e) {}
  }

  /** 处理重置日志路径的操作，将日志路径设置恢复为默认值 */
  const handleResetLogPath = () => set('logPath', '')

  /**
   * 渲染设置标签页的内容，根据传入的 section 对象动态生成设置项的表单元素，支持布尔值开关、路径选择和下拉选择等不同类型的设置项
   * @param {*} section 
   * @returns 
   */
  const renderSection = (section) => (
    <div key={section.section} className="settings-section">
      <div className="settings-section-title">{section.section}</div>
      <div className="settings-items">
        {section.items.map(item => (
          <div key={item.key} className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">{item.label}</span>
              {item.desc && <span className="settings-item-desc">{item.desc}</span>}
            </div>
            {item.type === 'boolean' && (
              <button
                className={`settings-toggle ${form[item.key] ? 'on' : 'off'}`}
                onClick={() => set(item.key, !form[item.key])}
              >
                <span className="settings-toggle-knob" />
              </button>
            )}
            {item.type === 'path' && (
              <div className="settings-path-row">
                <input
                  className="settings-path-input"
                  value={form[item.key] || DEFAULT_LOG_PATH}
                  placeholder={DEFAULT_LOG_PATH || '选择目录'}
                  readOnly
                  aria-label={`${item.label}：当前路径`}
                  onMouseEnter={(e) => showSettingsHoverTip(e, `当前日志目录：\n${form[item.key] || DEFAULT_LOG_PATH || '系统下载目录（默认）'}`)}
                  onMouseLeave={hideSettingsHoverTip}
                  onFocus={(e) => showSettingsHoverTip(e, `当前日志目录：\n${form[item.key] || DEFAULT_LOG_PATH || '系统下载目录（默认）'}`)}
                  onBlur={hideSettingsHoverTip}
                />
                <button className="settings-path-btn" onClick={handleChooseLogPath}>选择</button>
                <button
                  type="button"
                  className="settings-path-btn reset"
                  aria-label="恢复默认日志目录"
                  onClick={handleResetLogPath}
                  onMouseEnter={(e) => showSettingsHoverTip(e, `恢复默认目录为：\n${DEFAULT_LOG_PATH || '系统下载目录'}`)}
                  onMouseLeave={hideSettingsHoverTip}
                  onFocus={(e) => showSettingsHoverTip(e, `恢复默认目录为：\n${DEFAULT_LOG_PATH || '系统下载目录'}`)}
                  onBlur={hideSettingsHoverTip}
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
                {(item.options || []).map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>
    </div>
  )

  /** 渲染终端输出高亮标签页的内容，提供一个界面让用户添加、编辑和删除高亮规则，每个规则包含启用状态、匹配模式、是否使用正则表达式和高亮颜色等属性 */
  const renderHighlightTab = () => (
    <div className="settings-section">
      <div className="settings-section-title">终端输出高亮</div>
      <div className="settings-items">
        <div className="settings-item">
          <div className="settings-item-info">
            <span className="settings-item-label">高亮规则</span>
            <span className="settings-item-desc">为终端输出文本定义匹配表达式和高亮颜色</span>
          </div>
          <div className="settings-item-actions">
            <button type="button" className="settings-action-btn" onClick={handleResetHighlightRules}>重置规则</button>
            <button type="button" className="settings-action-btn" onClick={addHighlightRule}>新增规则</button>
          </div>
        </div>
        {(form.highlightRules || []).map((rule, idx) => (
          <div key={rule.id} className="settings-rule-item">
            <div className="settings-rule-top">
              <span className="settings-rule-index">规则 {idx + 1}</span>
              <input
                className="settings-rule-name-input"
                type="text"
                value={rule.name ?? ''}
                placeholder="请输入规则名字"
                aria-label="规则名称"
                onMouseEnter={(e) => showSettingsHoverTip(e, '规则名称')}
                onMouseLeave={hideSettingsHoverTip}
                onChange={(e) => updateHighlightRule(rule.id, { name: e.target.value })}
              />
              <span className="settings-rule-grid-placeholder" aria-hidden="true" />
              <button
                type="button"
                className={`settings-toggle ${rule.enabled ? 'on' : 'off'}`}
                aria-label={`${(rule.name || '').trim() || `未命名规则${idx + 1}`}：${rule.enabled ? '已启用' : '已禁用'}`}
                onMouseEnter={(e) => showSettingsHoverTip(e, rule.enabled ? '规则已启用' : '规则已禁用')}
                onMouseLeave={hideSettingsHoverTip}
                onFocus={(e) => showSettingsHoverTip(e, rule.enabled ? '规则已启用' : '规则已禁用')}
                onBlur={hideSettingsHoverTip}
                onClick={() => updateHighlightRule(rule.id, { enabled: !rule.enabled })}
              >
                <span className="settings-toggle-knob" />
              </button>
            </div>
            <div className="settings-rule-row">
              <button type="button" className="settings-action-btn danger" onClick={() => removeHighlightRule(rule.id)}>删除</button>
              <input
                className="settings-rule-pattern"
                type="text"
                value={rule.pattern}
                placeholder="请输入匹配规则"
                onMouseEnter={(e) => showSettingsHoverTip(e, '匹配高亮文本规则')}
                onMouseLeave={hideSettingsHoverTip}
                onChange={(e) => updateHighlightRule(rule.id, { pattern: e.target.value })}
              />
              <input
                className="settings-rule-color"
                type="color"
                value={rule.color || '#ffcc00'}
                aria-label="高亮颜色"
                onMouseEnter={(e) => showSettingsHoverTip(e, '点击选择匹配成功时终端里显示的高亮颜色')}
                onMouseLeave={hideSettingsHoverTip}
                onFocus={(e) => showSettingsHoverTip(e, '点击选择匹配成功时终端里显示的高亮颜色')}
                onBlur={hideSettingsHoverTip}
                onChange={(e) => updateHighlightRule(rule.id, { color: e.target.value })}
              />
              <div className="settings-rule-icon-toggles" role="group" aria-label="匹配选项">
              <button
                  type="button"
                  className={`settings-icon-toggle ${rule.caseSensitive === true ? 'active' : ''}`}
                  aria-label="区分大小写"
                  aria-pressed={rule.caseSensitive === true}
                  onMouseEnter={(e) => showSettingsHoverTip(e, rule.caseSensitive === true ? '区分大小写（点击改为忽略大小写）' : '忽略大小写（点击改为区分大小写）')}
                  onMouseLeave={hideSettingsHoverTip}
                  onFocus={(e) => showSettingsHoverTip(e, rule.caseSensitive === true ? '区分大小写（点击改为忽略大小写）' : '忽略大小写（点击改为区分大小写）')}
                  onBlur={hideSettingsHoverTip}
                  onClick={() => updateHighlightRule(rule.id, { caseSensitive: !rule.caseSensitive })}
                >
                  <HighlightCaseIcon />
                </button>
                <button
                  type="button"
                  className={`settings-icon-toggle ${(rule.useRegex ?? true) ? 'active' : ''}`}
                  aria-label="使用正则表达式"
                  aria-pressed={rule.useRegex ?? true}
                  onMouseEnter={(e) => showSettingsHoverTip(e, (rule.useRegex ?? true) ? '使用正则表达式（点击改为纯文本匹配）' : '纯文本匹配（点击改为正则）')}
                  onMouseLeave={hideSettingsHoverTip}
                  onFocus={(e) => showSettingsHoverTip(e, (rule.useRegex ?? true) ? '使用正则表达式（点击改为纯文本匹配）' : '纯文本匹配（点击改为正则）')}
                  onBlur={hideSettingsHoverTip}
                  onClick={() => updateHighlightRule(rule.id, { useRegex: !(rule.useRegex ?? true) })}
                >
                  <HighlightRegexIcon />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  /** 清空主进程加密库中的全部敏感凭据（不删除已保存会话条目） */
  const handleClearAllVaultSecrets = async () => {
    if (!confirm('确定清空全部已加密保存的敏感信息？\n已保存的会话列表仍会保留，但 SSH/Telnet 的密码、私钥与 passphrase 需重新输入或重新保存。')) return
    if (!confirm('再次确认：此操作不可恢复。')) return
    try {
      await clearAllVaultEntries()
      alert('已清空全部敏感信息')
    } catch (e) {
      alert('清空失败：' + (e?.message || String(e)))
    }
  }

  /** 凭据存储：单一总开关 + 清空加密库 */
  const renderCredentialsTab = () => (
    <div className="settings-section">
      <div className="settings-section-title">凭据存储</div>
      <p className="settings-credentials-intro">
        开启后，保存 SSH/Telnet 会话时会把密码、私钥路径或 PEM、私钥 passphrase 等一并写入系统加密存储。
        关闭并保存设置后，会按会话从加密库中移除这些字段；若系统不支持加密，保存会话时会提示且不会把明文写入磁盘。
      </p>
      <div className="settings-items">
        <div className="settings-item">
          <div className="settings-item-info">
            <span className="settings-item-label">保存敏感凭据到加密存储</span>
            <span className="settings-item-desc">涵盖 SSH 密码、私钥与 passphrase、Telnet 密码（Telnet 传输本身非加密，请仅在可信网络使用）</span>
          </div>
          <button
            type="button"
            className={`settings-toggle ${form.saveSecretsToVault ? 'on' : 'off'}`}
            onClick={() => set('saveSecretsToVault', !form.saveSecretsToVault)}
          >
            <span className="settings-toggle-knob" />
          </button>
        </div>
        <div className="settings-item">
          <div className="settings-item-info">
            <span className="settings-item-label">清空全部已保存的敏感信息</span>
            <span className="settings-item-desc">立即删除加密库中所有凭据；不影响会话列表与本地设置</span>
          </div>
          <button type="button" className="settings-action-btn danger" onClick={handleClearAllVaultSecrets}>清空</button>
        </div>
      </div>
    </div>
  )

  const renderSessionTab = () => (
    <div className="settings-section">
      <div className="settings-section-title">会话管理</div>
      <div className="settings-items">
        <div className="settings-item">
          <div className="settings-item-info">
            <span className="settings-item-label">导出会话</span>
            <span className="settings-item-desc">将所有保存的会话导出为 JSON 文件</span>
          </div>
          <button className="settings-action-btn" onClick={handleExport}>导出</button>
        </div>
        <div className="settings-item">
          <div className="settings-item-info">
            <span className="settings-item-label">导入会话</span>
            <span className="settings-item-desc">从 JSON 文件导入会话（与现有会话合并）</span>
          </div>
          <button className="settings-action-btn" onClick={() => importRef.current?.click()}>导入</button>
          <input ref={importRef} type="file" accept=".json" style={{display:'none'}} onChange={handleImport} />
        </div>
        <div className="settings-item">
          <div className="settings-item-info">
            <span className="settings-item-label">清除所有会话</span>
            <span className="settings-item-desc">删除全部保存的会话和分组，操作不可恢复</span>
          </div>
          <button className="settings-action-btn danger" onClick={handleClearAll}>清除</button>
        </div>
      </div>
      <div className="settings-section-title">设置管理</div>
      <div className="settings-items">
        <div className="settings-item">
          <div className="settings-item-info">
            <span className="settings-item-label">导出设置</span>
            <span className="settings-item-desc">将当前所有设置导出为 JSON 文件</span>
          </div>
          <button className="settings-action-btn" onClick={handleExportSettings}>导出</button>
        </div>
        <div className="settings-item">
          <div className="settings-item-info">
            <span className="settings-item-label">导入设置</span>
            <span className="settings-item-desc">从 JSON 文件导入设置（将覆盖当前设置）</span>
          </div>
          <button className="settings-action-btn" onClick={() => importSettingsRef.current?.click()}>导入</button>
          <input ref={importSettingsRef} type="file" accept=".json" style={{display:'none'}} onChange={handleImportSettings} />
        </div>
        <div className="settings-item">
          <div className="settings-item-info">
            <span className="settings-item-label">恢复默认设置</span>
            <span className="settings-item-desc">将本地保存的全部选项重置为应用内置默认值（会同时清除保存的密钥等敏感信息，但不影响已保存的会话列表）</span>
          </div>
          <button type="button" className="settings-action-btn danger" onClick={handleRestoreDefaultSettings}>恢复默认</button>
        </div>
      </div>
    </div>
  )

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
          <div className="settings-title"><span className="settings-title-icon">⚙ </span>设置</div>
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
            {activeTab === 'general' && GENERAL_SECTION_KEYS.map((name) => {
              const section = SETTINGS_SCHEMA.find((s) => s.section === name)
              return section ? <Fragment key={name}>{renderSection(section)}</Fragment> : null
            })}
            {activeTab === 'ssh-terminal' && (
              <>
                {renderAlgorithmTab()}
                {renderHighlightTab()}
              </>
            )}
            {activeTab === 'data-security' && (
              <>
                {renderSessionTab()}
                {renderCredentialsTab()}
              </>
            )}
          </div>
        </div>

        <div className="dialog-footer">
          <button type="button" className="btn-cancel" onClick={onClose}>取消</button>
          <button type="button" className="btn-save" onClick={handleSave}>保存</button>
          <button type="button" className="btn-save-connect" onClick={handleSaveAndClose}>保存并关闭</button>
        </div>
      </div>
    </div>
  )
}
