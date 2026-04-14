import React, { useState, useRef } from 'react'
import { SETTINGS_SCHEMA, saveSettings, DEFAULT_LOG_PATH } from '../store/settingsStore.js'
import { exportSessions, importSessions, saveSessions } from '../store/sessionStore.js'
import '../styles/dialog.css'
import '../styles/settings.css'

export default function SettingsDialog({ settings, savedSessions, onUpdateSessions, onUpdatePlaceholders, onClose, onSave }) {
  const [form, setForm] = useState({ ...settings })
  const importRef = useRef(null)

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const handleSave = () => {
    saveSettings(form)
    onSave(form)
    onClose()
  }

  const handleExport = () => exportSessions(savedSessions)

  const handleImport = async (e) => {
    const file = e.target.files[0]; if (!file) return
    try {
      const imported = await importSessions(file)
      const merged = [...savedSessions]
      imported.forEach(s => { if (!merged.find(m => m.savedId === s.savedId)) merged.push(s) })
      onUpdateSessions(merged)
      alert(`已导入 ${imported.length} 个会话`)
    } catch (err) { alert('导入失败：' + err.message) }
    e.target.value = ''
  }

  const handleClearAll = () => {
    if (!confirm('确定要清除所有保存的会话和分组吗？\n此操作不可恢复！')) return
    if (!confirm('再次确认：将删除全部会话数据，确定继续？')) return
    onUpdateSessions([])
    saveSessions([])
    // 同时清除所有分组占位符
    onUpdatePlaceholders?.([])
    alert('已清除所有会话和分组')
  }

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

  const handleResetLogPath = () => set('logPath', '')

  return (
    <div className="dialog-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dialog settings-dialog">
        <div className="dialog-header">
          <div className="settings-title"><span className="settings-title-icon">⚙ </span>设置</div>
          <button className="dialog-close" onClick={onClose}>×</button>
        </div>

        <div className="settings-body">
          {SETTINGS_SCHEMA.map(section => (
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
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* 会话管理 */}
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
