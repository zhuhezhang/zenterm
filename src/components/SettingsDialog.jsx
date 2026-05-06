import { useState, useRef } from 'react'
import { SETTINGS_SCHEMA, saveSettings, exportSettings, importSettings, DEFAULT_LOG_PATH } from '../store/settingsStore.js'
import { exportSessions, importSessions, saveSessions } from '../store/sessionStore.js'
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
 */
export default function SettingsDialog({ settings, savedSessions, onUpdateSessions, onUpdatePlaceholders, onClose, onSave }) {
  const [form, setForm] = useState({
    ...settings,
    highlightRules: settings.highlightRules ? [...settings.highlightRules] : [],
  })
  const importRef = useRef(null)  // 和useState类似，但它返回一个可变的ref对象，其.current属性被初始化为传入的参数（initialValue）。返回的ref对象在组件的整个生命周期内保持不变，因此它不会触发重新渲染
  const importSettingsRef = useRef(null)  // 用于导入设置的文件输入引用
  /** 定义设置界面中的标签页，每个标签页对应一个设置分类 */
  const tabs = [
    { key: '操作确认', label: '操作确认' },
    { key: '终端行为', label: '终端行为' },
    { key: '日志', label: '日志' },
    { key: '终端输出高亮', label: '终端输出高亮' },
    { key: '会话设置管理', label: '会话设置管理' },
  ]
  const [activeTab, setActiveTab] = useState(tabs[0].key)


  /** 创建一个新的高亮规则对象，包含唯一的 ID、启用状态、是否使用正则表达式、匹配模式和颜色 */
  const createHighlightRule = () => ({
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    enabled: true,
    useRegex: true,
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

  /**
   * 更新设置
   * @param {string} key 设置项的键
   * @param {any} value 设置项的新值
   */
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))  // [key] 表示“用这个变量的值作为属性名”

  /** 处理保存设置的操作，将当前表单数据保存到设置中，并调用 onSave 回调函数传递新的设置对象，最后调用 onClose 关闭对话框 */
  const handleSave = () => {
    saveSettings(form)
    onSave(form)
    onClose()
  }

  /** 处理导出会话的操作，将当前的 savedSessions 导出为 JSON 文件 */
  const handleExport = () => exportSessions(savedSessions)

  /** 处理导入会话的操作，触发文件选择对话框，选择 JSON 文件后将其内容导入并与现有会话合并，最后更新会话列表 */
  const handleImport = async (e) => {
    const file = e.target.files[0]; if (!file) return
    try {
      const imported = await importSessions(file)
      const merged = [...savedSessions]
      imported.forEach(s => { if (!merged.find(m => m.savedId === s.savedId) && !merged.find(m => m.label === s.label)) merged.push(s) })
      onUpdateSessions(merged)
      alert(`已导入 ${merged.length - savedSessions.length} 个新会话，相同 ID 或名称的会话已被忽略`)
    } catch (err) { alert('导入失败：' + err.message) }
    e.target.value = ''
  }

  /** 处理清除所有会话的操作，弹出两次确认对话框，确认后清除所有保存的会话和分组占位符，并更新会话列表和占位符列表 */
  const handleClearAll = () => {
    if (!confirm('确定要清除所有保存的会话和分组吗？\n此操作不可恢复！')) return
    if (!confirm('再次确认：将删除全部会话数据，确定继续？')) return
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
      })  // 更新表单状态
      alert('设置已导入，请点击"保存"按钮应用更改')
    } catch (err) {
      alert('导入失败：' + err.message)
    }
    e.target.value = ''  // 重置文件输入
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
                  title={form[item.key] || DEFAULT_LOG_PATH || '系统下载目录'}
                  readOnly
                />
                <button className="settings-path-btn" onClick={handleChooseLogPath}>选择</button>
                <button
                  className="settings-path-btn reset"
                  onClick={handleResetLogPath}
                  title={`恢复默认：${DEFAULT_LOG_PATH || '系统下载目录'}`}
                >↺</button>
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
          <button className="settings-action-btn" onClick={addHighlightRule}>新增规则</button>
        </div>
        {(form.highlightRules || []).map((rule, idx) => (
          <div key={rule.id} className="settings-rule-item">
            <div className="settings-rule-row">
              <button
                className={`settings-toggle ${rule.enabled ? 'on' : 'off'}`}
                onClick={() => updateHighlightRule(rule.id, { enabled: !rule.enabled })}
                title={rule.enabled ? '已启用' : '已禁用'}
              >
                <span className="settings-toggle-knob" />
              </button>
              <input
                className="settings-rule-pattern"
                type="text"
                value={rule.pattern}
                placeholder="正则表达式，例如 error|failed"
                onChange={(e) => updateHighlightRule(rule.id, { pattern: e.target.value })}
              />
              <label className="settings-rule-regex">
                <input
                  type="checkbox"
                  checked={rule.useRegex ?? true}
                  onChange={(e) => updateHighlightRule(rule.id, { useRegex: e.target.checked })}
                />
                正则
              </label>
              <input
                className="settings-rule-color"
                type="color"
                value={rule.color || '#ffcc00'}
                onChange={(e) => updateHighlightRule(rule.id, { color: e.target.value })}
              />
              <button className="settings-action-btn danger" onClick={() => removeHighlightRule(rule.id)}>删除</button>
            </div>
            <div className="settings-rule-desc">
              <span>规则 {idx + 1}</span>
              <span>{rule.enabled ? '启用' : '禁用'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  /** 渲染会话管理标签页的内容，提供导出、导入和清除会话的功能，允许用户备份和恢复会话数据，以及清空所有会话数据 */
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
      </div>
    </div>
  )

  return (
    <div className="dialog-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dialog settings-dialog">
        <div className="dialog-header">
          <div className="settings-title"><span className="settings-title-icon">⚙ </span>设置</div>
          <button className="dialog-close" onClick={onClose}>×</button>
        </div>

        <div className="settings-body">
          <div className="settings-tabs">
            {tabs.map(tab => (
              <button
                key={tab.key}
                className={`settings-tab ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="settings-tab-panels">
            {activeTab !== '终端输出高亮' && activeTab !== '会话设置管理' && (
              renderSection(SETTINGS_SCHEMA.find(section => section.section === activeTab) || SETTINGS_SCHEMA[0])
            )}
            {activeTab === '终端输出高亮' && renderHighlightTab()}
            {activeTab === '会话设置管理' && renderSessionTab()}
          </div>
        </div>

        <div className="dialog-footer">
          <button className="btn-cancel" onClick={onClose}>取消</button>
          <button className="btn-connect" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  )
}
