import { useState, useRef, useEffect } from 'react'
import ConnectionTypeIcon from './common.jsx'
import '../styles/tabbar.css'

const STATUS_DOT = { connecting: '●', connected: '●', disconnected: '○', error: '●' }
const STATUS_CLS = { connecting: 'connecting', connected: 'connected', disconnected: 'disconnected', error: 'error' }

/**
 * 标签栏组件，显示当前会话列表和控制按钮。
 * 通过 useState 管理右键菜单状态，useRef 管理拖拽状态和 DOM 引用。
 * 支持标签页选择、关闭、新建、右键菜单操作和拖拽排序
 * @param {Object} props - 组件属性
 * @param {Object[]} props.sessions 当前会话列表，每个会话包含 id、type、label、status 等属性
 * @param {string} props.activeId 当前活跃会话 ID
 * @param {function} props.onSelect 选择标签页的回调函数，参数为会话 ID
 * @param {function} props.onClose 关闭标签页的回调函数，参数为会话 ID
 * @param {function} props.onNew 新建标签页的回调函数，无参数
 * @param {function} props.onReorder 拖拽排序后的回调函数，参数为 fromId 和 toId
 * @param {function} props.onSaveOutput 保存标签页终端输出的回调函数，参数为会话 ID
 */
export default function TabBar({ sessions, activeId, onSelect, onClose, onNew, onReorder, onSaveOutput }) {
  const [ctxMenu, setCtxMenu] = useState(null)  // 右键菜单状态，包含 { x, y, id, idx }，表示菜单位置和对应的标签页 ID 和索引
  const dragRef = useRef(null)  // 当前拖拽的标签 ID
  const tabsRef = useRef(null)  // 标签容器的 DOM 引用
  const prevCountRef = useRef(sessions.length) // 上一次会话数量的引用，用于检测新增标签页

  // useEffect 监听 sessions.length 变化，如果增加了新的会话且 tabsRef 已经挂载，就将 scrollLeft 设置为 scrollWidth，
  // 使得标签栏滚动到最右侧，确保新标签页可见。最后更新 prevCountRef.current 为当前的 sessions.length，以便下一次比较。
  useEffect(() => {
    if (sessions.length > prevCountRef.current && tabsRef.current) {
      tabsRef.current.scrollLeft = tabsRef.current.scrollWidth
    }
    prevCountRef.current = sessions.length
  }, [sessions.length])

  useEffect(() => {  // 右键菜单打开后，点击菜单外区域自动关闭
    if (!ctxMenu) return
    const onDocMouseDown = (e) => {
      if (e.target?.closest?.('.tab-context-menu')) return
      closeCtx()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [ctxMenu])

  /** 
   * 右键菜单操作函数，分别用于关闭当前标签页、关闭其他标签页、关闭左侧标签页、关闭右侧标签页和关闭全部标签页。
   * 每个函数调用对应的 onClose 回调来关闭指定的标签页，并调用 closeCtx 来关闭右键菜单
   * @param {Event} e 右键点击事件对象
   * @param {string} id 要关闭的标签页 ID
   * @param {number} idx 要关闭的标签页索引
   */
  const openCtx = (e, id, idx) => {
    e.preventDefault()
    e.stopPropagation()  // 阻止事件冒泡，避免触发父元素的点击事件
    setCtxMenu({ x: e.clientX, y: e.clientY, id, idx })
  }

  /** 关闭右键菜单 */
  const closeCtx = () => setCtxMenu(null)
  /**
   * 关闭标签页
   * @param {string} id 要关闭的标签页 ID
   */
  const closeTab    = (id) => { onClose(id); closeCtx() }
  /**
   * 关闭其他标签页
   * @param {string} id 要保留的标签页 ID
   */
  const closeOthers = (id) => { sessions.filter(s => s.id !== id).forEach(s => onClose(s.id)); closeCtx() }
  /**
   * 关闭左侧标签页
   * @param {number} idx 要关闭的标签页索引
   */
  const closeLeft   = (idx) => { sessions.slice(0, idx).forEach(s => onClose(s.id)); closeCtx() }
  /**
   * 关闭右侧标签页
   * @param {number} idx 要关闭的标签页索引
   */
  const closeRight  = (idx) => { sessions.slice(idx + 1).forEach(s => onClose(s.id)); closeCtx() }
  /** 关闭全部标签页 */
  const closeAll    = () => { sessions.forEach(s => onClose(s.id)); closeCtx() }

  /**
   * 拖拽事件处理函数：开始拖拽
   * onDragStart 设置 dragRef.current 为当前拖拽的标签 ID，并添加 dragging 类以改变样式。
   * @param {Event} e 拖拽事件对象
   * @param {string} id 当前拖拽的标签页 ID
   */
  const onDragStart = (e, id) => {
    dragRef.current = id
    e.dataTransfer.effectAllowed = 'move'  // 告诉浏览器这次拖拽是移动操作；这会影响拖拽光标样式和可用 drop 行为；说明用户移动标签，而不是复制
    e.dataTransfer.setData('text/plain', id)  // 设置拖拽数据为标签 ID，虽然在这个实现中我们不依赖这个数据，但它是必须的，否则某些浏览器可能无法正确处理拖拽事件
    e.currentTarget.classList.add('dragging')  // 添加 dragging 类以改变样式，提供视觉反馈，告诉用户正在拖拽哪个标签
  }

  /** 
   * 拖拽事件处理函数：拖拽经过
   * onDragOver 调用 e.preventDefault() 以允许 drop，并设置拖拽效果为 move。
   * @param {Event} e 拖拽事件对象
   */
  const onDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  /** 
   * 拖拽事件处理函数：放下
   * onDrop 获取拖拽来源的标签 ID（fromId）和目标标签 ID（toId），如果有效且不同，则调用 onReorder 回调来更新标签顺序，并重置 dragRef.current。
   * @param {Event} e 拖拽事件对象
   * @param {string} toId 放下目标的标签页 ID
   */
  const onDrop = (e, toId) => {
    e.preventDefault()
    const fromId = dragRef.current
    if (!fromId || fromId === toId) return
    if (onReorder) onReorder(fromId, toId)
    dragRef.current = null
  }

  /** 
   * 拖拽事件处理函数：结束拖拽
   * onDragEnd 将 dragRef.current 重置为 null，并移除 dragging 类。
   * @param {Event} e 拖拽事件对象
   */
  const onDragEnd = (e) => {
    e.currentTarget.classList.remove('dragging')
    dragRef.current = null
  }

  return (
    <div className="tabbar" onClick={ctxMenu ? closeCtx : undefined}>
      <div className="tabbar-tabs" ref={tabsRef}>  {/* ref={tabsRef} 用于把这个 div 的真实 DOM 元素保存到 tabsRef.current */}
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
            <span className="tab-icon">{ConnectionTypeIcon[s.type] || '⌨'}</span>
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
          <button onClick={() => { onSaveOutput?.(ctxMenu.id); closeCtx() }}>保存终端输出</button>
          <div className="tab-ctx-divider" />
          <button className="danger" onClick={closeAll}>关闭全部标签页</button>
        </div>
      )}
    </div>
  )
}
