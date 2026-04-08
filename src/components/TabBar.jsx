import React, { useState, useRef, useCallback, useEffect } from 'react'
import '../styles/tabbar.css'

const TYPE_ICONS = { ssh: '⌨', telnet: '🔌', serial: '⚡' }
const STATUS_DOT = { connecting: '●', connected: '●', disconnected: '○', error: '●' }
const STATUS_CLS = { connecting: 'connecting', connected: 'connected', disconnected: 'disconnected', error: 'error' }

export default function TabBar({ sessions, activeId, onSelect, onClose, onNew, onReorder }) {
  const [ctxMenu, setCtxMenu] = useState(null)  // { x, y, id, idx }
  const dragRef = useRef(null)
  const tabsRef = useRef(null)

  // 新 tab 出现时（activeId 变化且是最新 tab），滚动到可见
  const prevCountRef = useRef(sessions.length)
  useEffect(() => {
    if (sessions.length > prevCountRef.current && tabsRef.current) {
      // 滚动到最右侧，确保新 tab 可见
      tabsRef.current.scrollLeft = tabsRef.current.scrollWidth
    }
    prevCountRef.current = sessions.length
  }, [sessions.length])

  // ── 右键菜单 ──────────────────────────────────
  const openCtx = (e, id, idx) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY, id, idx })
  }
  const closeCtx = () => setCtxMenu(null)

  const closeTab    = (id) => { onClose(id); closeCtx() }
  const closeOthers = (id) => { sessions.filter(s => s.id !== id).forEach(s => onClose(s.id)); closeCtx() }
  const closeLeft   = (idx) => { sessions.slice(0, idx).forEach(s => onClose(s.id)); closeCtx() }
  const closeRight  = (idx) => { sessions.slice(idx + 1).forEach(s => onClose(s.id)); closeCtx() }
  const closeAll    = () => { sessions.forEach(s => onClose(s.id)); closeCtx() }

  // ── 拖拽排序 ──────────────────────────────────
  const onDragStart = (e, id) => {
    dragRef.current = id
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    e.currentTarget.classList.add('dragging')
  }
  const onDragEnd = (e) => {
    e.currentTarget.classList.remove('dragging')
    dragRef.current = null
  }
  const onDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }
  const onDrop = (e, toId) => {
    e.preventDefault()
    const fromId = dragRef.current
    if (!fromId || fromId === toId) return
    if (onReorder) onReorder(fromId, toId)
    dragRef.current = null
  }

  return (
    <div className="tabbar" onClick={ctxMenu ? closeCtx : undefined}>
      <div className="tabbar-tabs" ref={tabsRef}>
        {sessions.map((s, idx) => (
          <div
            key={s.id}
            className={`tab ${s.id === activeId ? 'active' : ''}`}
            onClick={() => onSelect(s.id)}
            onContextMenu={(e) => openCtx(e, s.id, idx)}
            draggable
            onDragStart={(e) => onDragStart(e, s.id)}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, s.id)}
          >
            <span className="tab-icon">{TYPE_ICONS[s.type] || '⌨'}</span>
            <span className={`tab-status ${STATUS_CLS[s.status] || ''}`}>{STATUS_DOT[s.status] || '○'}</span>
            <span className="tab-label">{s.label || `${s.type?.toUpperCase()} ${s.host || s.path || ''}`}</span>
            {s.sftpReady && <span className="tab-sftp-badge" title="SFTP 已就绪">⇅</span>}
            <button className="tab-close" onClick={e => { e.stopPropagation(); onClose(s.id) }} title="关闭">×</button>
          </div>
        ))}
        <button className="tab-new" onClick={onNew} title="新建连接">＋</button>
      </div>

      {ctxMenu && (
        <div
          className="tab-context-menu"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <button onClick={() => closeTab(ctxMenu.id)}>关闭标签页</button>
          <button onClick={() => closeOthers(ctxMenu.id)} disabled={sessions.length <= 1}>关闭其他标签页</button>
          <button onClick={() => closeLeft(ctxMenu.idx)} disabled={ctxMenu.idx === 0}>关闭左侧标签页</button>
          <button onClick={() => closeRight(ctxMenu.idx)} disabled={ctxMenu.idx === sessions.length - 1}>关闭右侧标签页</button>
          <div className="tab-ctx-divider" />
          <button className="danger" onClick={closeAll}>关闭全部标签页</button>
        </div>
      )}
    </div>
  )
}
