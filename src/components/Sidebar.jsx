import React, { useState, useRef } from 'react'
import { duplicateSavedSession, addGroupPlaceholder, uniqueLabelInGroup, vacatedNamedGroupIfEmpty } from '../store/sessionStore.js'
import '../styles/sidebar.css'

const TYPE_ICONS  = { ssh: '⌨', telnet: '🔌', serial: '⚡' }
const TYPE_COLORS = { ssh: '#58a6ff', telnet: '#3fb950', serial: '#ffa657' }
/** 名称非法字符验证正则表达式 */
const INVALID_LABEL_CHARS = /[\/\\:*?"\u003c\u003e|\x00]/

/** sftp和会话分组展开/收起图标 */
const Chevron = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

/**
 * 文件夹图标组件，根据是否展开显示不同的图标
 * @param {object} props 组件属性
 * @param {boolean} props.open 是否展开
 * @returns {JSX.Element} 文件夹图标组件
 */
const FolderIcon = ({ open }) => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" opacity="0.85">
    {open
      ? <path d="M1.5 3A1.5 1.5 0 000 4.5v8A1.5 1.5 0 001.5 14h13a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0014.5 4H7.707L6.354 2.646A.5.5 0 006 2.5H1.5z"/>
      : <path d="M.5 3l.04-.87a1.99 1.99 0 011.96-1.13H6a2 2 0 011.998 1.858L8 3h5.5A1.5 1.5 0 0115 4.5v8a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9A.5.5 0 00.5 3z"/>}
  </svg>
)

/**
 * 构建会话树结构，支持分组和未分组会话
 * @param {array} savedSessions 已保存的会话列表，每个会话包含 id、label、group 等属性
 * @param {array} groupPlaceholders 分组占位符列表
 * @returns {array} 构建好的会话树结构
 */
function buildTree(savedSessions, groupPlaceholders) {
  const groupMap = {}  // 临时存储分组节点，key 是分组路径，value 是分组对象
  /** 
   * 获取或创建分组节点，如果不存在则创建一个新的分组节点并添加到 groupMap 中，同时处理父分组关系
   * @param {string} path 分组路径，例如 "分组1/子分组A"
   * @returns {object} 分组节点对象，包含 id、type、name、path 和 children 属性
   */
  const getOrCreate = (path) => {
    if (groupMap[path]) return groupMap[path]  // 如果分组节点已存在，直接返回
    const name = path.split('/').pop()  // 取路径最后一段作为分组显示名，例如 prod/db => db
    const node = { id: path, type: 'group', name, path, children: [] }  // 创建新的分组节点对象，id 和 path 都使用完整路径，name 使用最后一段
    groupMap[path] = node  // 将节点缓存到 groupMap，后续可以直接复用
    const parentPath = path.includes('/') ? path.split('/').slice(0, -1).join('/') : null  // 计算父分组路径，例如 prod/db => prod，单层分组则没有父分组
    if (parentPath) getOrCreate(parentPath).children.push(node)  // 如果有父分组，递归获取或创建父分组节点，并将当前节点添加到父分组的 children 中，构建树形结构
    return node
  }
  groupPlaceholders.forEach(g => getOrCreate(g))  // 先处理分组占位符，确保所有分组节点都被创建，即使没有会话属于该分组
  savedSessions.forEach(s => { if (s.group) getOrCreate(s.group) })
  const ungrouped = []
  savedSessions.forEach(s => {
    const sessNode = { id: s.savedId, type: 'session', name: s.label || s.host || s.id, session: s }
    if (s.group && groupMap[s.group]) groupMap[s.group].children.push(sessNode)
    else ungrouped.push(sessNode)
  })
  const rootGroups = Object.values(groupMap).filter(n => !n.path.includes('/'))
  // 分组和会话分别按名称排序
  const sortNodes = (nodes) => {
    const groups = nodes.filter(n => n.type === 'group').sort((a, b) => a.name.localeCompare(b.name))
    const sessions = nodes.filter(n => n.type === 'session').sort((a, b) => a.name.localeCompare(b.name))
    groups.forEach(g => { g.children = sortNodes(g.children) })
    return [...groups, ...sessions]
  }
  return sortNodes([...rootGroups, ...ungrouped])
}

export default function Sidebar(props) {
  const {
    open, onToggle, savedSessions, onNewSession, onConnectSaved,
    onDeleteSaved, onUpdateSessions, activeSftpSessionId,
    sftpFiles, sftpPath, sftpLoading, onSftpNavigate, onSftpGoUp,
    onSftpJumpTo, onSftpDrop, settings, onOpenSettings, style,
    groupPlaceholders = [], onUpdatePlaceholders,
  } = props

  // 启动时仅展开“保存的会话”根节点，一级分组及以下默认收起
  const [expanded, setExpanded] = useState({})
  const [sessionsCollapsed, setSessionsCollapsed] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)
  const [renaming, setRenaming] = useState(null)
  const [renameVal, setRenameVal] = useState('')
  const [renamingSession, setRenamingSession] = useState(null)  // savedId
  const [renameSessionVal, setRenameSessionVal] = useState('')
  const [sftpExpanded, setSftpExpanded] = useState(true)
  const [dragOver, setDragOver] = useState(null)
  const dragRef = useRef(null)
  const renameGroupInputRef = useRef(null)
  const renameGroupAlertingRef = useRef(false)
  const ignoreRenameGroupBlurRef = useRef(false)
  const renameSessionInputRef = useRef(null)
  const renameSessionAlertingRef = useRef(false)
  const ignoreRenameSessionBlurRef = useRef(false)

  const isExp = (path) => expanded[path] === true
  const togExp = (path) => setExpanded(p => ({ ...p, [path]: !isExp(path) }))
  const openCtx = (e, type, data) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, type, data }) }
  const closeCtx = () => setContextMenu(null)

  // 展开/收起所有分组
  const expandAll = () => {
    const all = {}
    const collectGroups = (nodes) => nodes.forEach(n => { if (n.type === 'group') { all[n.path] = true; collectGroups(n.children) } })
    collectGroups(buildTree(savedSessions, groupPlaceholders))
    setExpanded(all)
    setSessionsCollapsed(false)
  }
  const collapseAll = () => {
    setExpanded({})
    setSessionsCollapsed(false)
  }

  const expandGroupAll = (groupPath) => {
    const all = {}
    const collectGroups = (nodes) => nodes.forEach(n => { if (n.type === 'group') { all[n.path] = true; collectGroups(n.children) } })
    const walk = (nodes) => {
      for (const n of nodes) {
        if (n.type !== 'group') continue
        if (n.path === groupPath) {
          collectGroups([n])
          return true
        }
        if (walk(n.children)) return true
      }
      return false
    }
    walk(buildTree(savedSessions, groupPlaceholders))
    setExpanded(prev => ({ ...prev, ...all }))
    setSessionsCollapsed(false)
  }

  const collapseGroupAll = (groupPath) => {
    setExpanded(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(k => {
        if (k === groupPath || k.startsWith(groupPath + '/')) next[k] = false
      })
      return next
    })
  }

  const renameGroup = (oldPath, newName) => {
    const trimmed = newName.trim()
    if (!trimmed) { setRenaming(null); return }
    if (INVALID_LABEL_CHARS.test(trimmed)) {
      if (renameGroupAlertingRef.current) return
      renameGroupAlertingRef.current = true
      ignoreRenameGroupBlurRef.current = true
      alert('分组名不允许包含以下字符：/ \\ : * ? " < > |')
      renameGroupAlertingRef.current = false
      setTimeout(() => {
        renameGroupInputRef.current?.focus()
        ignoreRenameGroupBlurRef.current = false
      }, 0)
      return
    }
    const oldName = oldPath.split('/').pop()
    if (trimmed === oldName) { setRenaming(null); return }
    const parts = oldPath.split('/')
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
    const usedSiblingNames = new Set()
    const all = new Set([...groupPlaceholders, ...savedSessions.map(s => s.group).filter(Boolean)])
    for (const p of all) {
      if (p === oldPath || p.startsWith(oldPath + '/')) continue
      if (parentPath) {
        if (!p.startsWith(parentPath + '/')) continue
        const rest = p.slice(parentPath.length + 1)
        const child = rest.split('/')[0]
        if (child) usedSiblingNames.add(child)
      } else {
        const child = p.split('/')[0]
        if (child) usedSiblingNames.add(child)
      }
    }
    let uniqueName = trimmed
    if (usedSiblingNames.has(uniqueName)) {
      let i = 1
      while (usedSiblingNames.has(`${trimmed}(${i})`)) i++
      uniqueName = `${trimmed}(${i})`
    }
    parts[parts.length - 1] = uniqueName
    const newPath = parts.join('/')
    onUpdateSessions(savedSessions.map(s =>
      s.group === oldPath ? { ...s, group: newPath } :
      s.group?.startsWith(oldPath + '/') ? { ...s, group: newPath + s.group.slice(oldPath.length) } : s
    ))
    onUpdatePlaceholders?.(groupPlaceholders.map(g =>
      g === oldPath ? newPath : g.startsWith(oldPath + '/') ? newPath + g.slice(oldPath.length) : g
    ))
    setRenaming(null)
  }

  const deleteGroup = (path) => {
    const w = settings?.deleteGroupWithSessions
    const name = path.split('/').pop()
    const msg = w ? `删除分组「${name}」及其所有内容？` : `删除分组「${name}」？组内会话将变为未分组。`
    if (settings?.confirmDeleteGroup !== false && !confirm(msg)) return
    if (w) onUpdateSessions(savedSessions.filter(s => s.group !== path && !s.group?.startsWith(path + '/')))
    else onUpdateSessions(savedSessions.map(s => (s.group === path || s.group?.startsWith(path + '/')) ? { ...s, group: '' } : s))
    onUpdatePlaceholders?.(groupPlaceholders.filter(g => g !== path && !g.startsWith(path + '/')))
  }

  const deleteSession = (id, label) => {
    if (settings?.confirmDeleteSession !== false && !confirm(`删除会话「${label}」？`)) return
    onDeleteSaved(id)
  }
  const dupSession = (id) => onUpdateSessions(duplicateSavedSession(savedSessions, id))

  const renameSession = (savedId, newLabel) => {
    const trimmed = newLabel.trim()
    if (!trimmed) {
      // 空标签：恢复原标签，取消编辑
      setRenamingSession(null)
      return
    }
    if (INVALID_LABEL_CHARS.test(trimmed)) {
      if (renameSessionAlertingRef.current) return
      renameSessionAlertingRef.current = true
      ignoreRenameSessionBlurRef.current = true
      alert('标签名不允许包含以下字符：/ \\ : * ? " < > |')
      renameSessionAlertingRef.current = false
      setTimeout(() => {
        renameSessionInputRef.current?.focus()
        ignoreRenameSessionBlurRef.current = false
      }, 0)
      return
    }
    const target = savedSessions.find(s => s.savedId === savedId)
    if (!target || trimmed === target.label) { setRenamingSession(null); return }
    // 修改后：使用 uniqueLabelInGroup 确保唯一性
    const uniqueLabel = uniqueLabelInGroup(savedSessions, target.group, trimmed, savedId)
    onUpdateSessions(savedSessions.map(s => s.savedId === savedId ? { ...s, label: uniqueLabel } : s))
    setRenamingSession(null)
  }

  const dStart = (e, id, type) => {
    dragRef.current = { id, type }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    e.stopPropagation()
  }
  const dEnd = () => { dragRef.current = null; setDragOver(null) }
  const dOver = (e, id, zone) => {
    e.preventDefault(); e.stopPropagation()
    setDragOver(prev => (prev?.id === id && prev?.zone === zone) ? prev : { id, zone })
  }
  const dLeave = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null) }
  const isDO = (id, zone) => dragOver?.id === id && dragOver?.zone === zone
  const collectAllGroupPaths = () => {
    const all = new Set(groupPlaceholders)
    savedSessions.forEach(s => { if (s.group) all.add(s.group) })
    return all
  }
  const uniqueGroupNameUnder = (parentPath, preferredName, movingGroupPath) => {
    const used = new Set()
    for (const p of collectAllGroupPaths()) {
      if (p === movingGroupPath || p.startsWith(movingGroupPath + '/')) continue
      if (parentPath) {
        if (!p.startsWith(parentPath + '/')) continue
        const rest = p.slice(parentPath.length + 1)
        const child = rest.split('/')[0]
        if (child) used.add(child)
      } else {
        const child = p.split('/')[0]
        if (child) used.add(child)
      }
    }
    if (!used.has(preferredName)) return preferredName
    let i = 1
    while (used.has(`${preferredName}(${i})`)) i++
    return `${preferredName}(${i})`
  }

  const dropOnGroup = (e, groupPath) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(null)
    const src = dragRef.current; if (!src) return
    if (src.type === 'session') {
      // 会话拖到分组，检查是否有同名会话
      const movedSession = savedSessions.find(s => s.savedId === src.id)
      if (!movedSession) return
      const siblings = savedSessions.filter(s => (s.group || '') === groupPath && s.savedId !== src.id)
      const used = new Set(siblings.map(s => s.label))
      let newLabel = movedSession.label
      if (used.has(newLabel)) {
        let i = 1
        while (used.has(`${movedSession.label}(${i})`)) i++
        newLabel = `${movedSession.label}(${i})`
      }
      const next = savedSessions.map(s => s.savedId === src.id ? { ...s, group: groupPath, label: newLabel } : s)
      const v = vacatedNamedGroupIfEmpty(movedSession.group, next)
      onUpdateSessions(next, v ? { placeholderForVacatedGroup: v } : undefined)
    } else if (src.type === 'group' && src.id !== groupPath && !groupPath.startsWith(src.id + '/')) {
      const oldPath = src.id
      const preferredName = oldPath.split('/').pop()
      const targetName = uniqueGroupNameUnder(groupPath, preferredName, oldPath)
      const newPath = groupPath + '/' + targetName
      onUpdateSessions(savedSessions.map(s =>
        s.group === oldPath ? { ...s, group: newPath } :
        s.group?.startsWith(oldPath + '/') ? { ...s, group: newPath + s.group.slice(oldPath.length) } : s
      ))
      onUpdatePlaceholders?.(Array.from(new Set(groupPlaceholders.map(g =>
        g === oldPath ? newPath :
        g.startsWith(oldPath + '/') ? newPath + g.slice(oldPath.length) : g
      ))))
    }
    dragRef.current = null
  }
  const dropOnSession = (e, sessId, groupPath) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(null)
    const src = dragRef.current; if (!src || src.type !== 'session' || src.id === sessId) return
    const arr = savedSessions.slice()
    const fi = arr.findIndex(s => s.savedId === src.id)
    const ti = arr.findIndex(s => s.savedId === sessId)
    if (fi < 0 || ti < 0) return
    const [item] = arr.splice(fi, 1)
    // 移动到新分组时，检查是否有同名会话，有则自动重命名
    const movedItem = { ...item, group: groupPath }
    const siblings = arr.filter(s => (s.group || '') === groupPath)
    const used = new Set(siblings.map(s => s.label))
    if (used.has(movedItem.label)) {
      let i = 1
      while (used.has(`${movedItem.label}(${i})`)) i++
      movedItem.label = `${movedItem.label}(${i})`
    }
    arr.splice(ti, 0, movedItem)
    const v = vacatedNamedGroupIfEmpty(item.group, arr)
    onUpdateSessions(arr, v ? { placeholderForVacatedGroup: v } : undefined)
    dragRef.current = null
  }
  const dropUngroup = (e) => {
    e.preventDefault(); setDragOver(null)
    const src = dragRef.current
    if (!src) return
    if (src.type === 'session') {
      const movedSession = savedSessions.find(s => s.savedId === src.id)
      if (!movedSession) { dragRef.current = null; return }
      const interim = savedSessions.map(s => s.savedId === src.id ? { ...s, group: '' } : s)
      const newLabel = uniqueLabelInGroup(interim, '', movedSession.label, src.id)
      const next = savedSessions.map(s => s.savedId === src.id ? { ...s, group: '', label: newLabel } : s)
      const v = vacatedNamedGroupIfEmpty(movedSession.group, next)
      onUpdateSessions(next, v ? { placeholderForVacatedGroup: v } : undefined)
    } else if (src.type === 'group') {
      const oldPath = src.id
      const preferredName = oldPath.split('/').pop()
      const targetName = uniqueGroupNameUnder('', preferredName, oldPath)
      const newPath = targetName
      onUpdateSessions(savedSessions.map(s =>
        s.group === oldPath ? { ...s, group: newPath } :
        s.group?.startsWith(oldPath + '/') ? { ...s, group: newPath + s.group.slice(oldPath.length) } : s
      ))
      onUpdatePlaceholders?.(Array.from(new Set(groupPlaceholders.map(g =>
        g === oldPath ? newPath :
        g.startsWith(oldPath + '/') ? newPath + g.slice(oldPath.length) : g
      ))))
    }
    dragRef.current = null
  }

  const tree = buildTree(savedSessions, groupPlaceholders)
  const hasSftp = !!activeSftpSessionId

  return (
    <div className={`sidebar ${open ? 'open' : 'closed'}`} style={open ? style : undefined} onClick={closeCtx}>
      <SidebarTop open={open} onToggle={onToggle} onOpenSettings={onOpenSettings} />
      {open && (
        <div className="sidebar-content">
          {hasSftp && (
            <div className="sidebar-sftp-section">
              <div className="sb-section-row" onClick={() => setSftpExpanded(v => !v)}>
                <span className={`sb-chevron${sftpExpanded ? ' open' : ''}`}><Chevron /></span>
                <span className="sb-section-label">远程文件</span>
                {sftpLoading && <span className="sb-loading">…</span>}
              </div>
              {sftpExpanded && <SftpTree items={sftpFiles} currentPath={sftpPath}
                onNavigate={onSftpNavigate} onGoUp={onSftpGoUp} onJumpTo={onSftpJumpTo} onDrop={onSftpDrop} />}
            </div>
          )}
          <div className="sb-section-row sessions-header" 
            onClick={() => setSessionsCollapsed(v => !v)}
            onContextMenu={e => openCtx(e, 'sessions-header', null)}>
            <span className={`sb-chevron${sessionsCollapsed ? '' : ' open'}`}><Chevron /></span>
            <span className="sb-section-label">保存的会话</span>
          </div>
          {!sessionsCollapsed && (
            <div
              className={`sb-tree${isDO('__root__', 'drop') ? ' drop-target' : ''}`}
              onDragOver={e => dOver(e, '__root__', 'drop')}
              onDragLeave={dLeave}
              onDrop={dropUngroup}>
              {tree.length === 0 && (
                <div className="sb-empty">
                  <span>暂无保存的会话</span>
                  <button className="sb-link" onClick={() => onNewSession('ssh')}>新建连接</button>
                </div>
              )}
              {tree.map(node => (
                <TreeNode key={node.id} node={node} depth={0}
                  isExp={isExp} togExp={togExp} openCtx={openCtx} onConnectSaved={onConnectSaved}
                  renaming={renaming} renameVal={renameVal} setRenameVal={setRenameVal}
                  setRenaming={setRenaming} renameGroup={renameGroup}
                  renameGroupInputRef={renameGroupInputRef} ignoreRenameGroupBlurRef={ignoreRenameGroupBlurRef}
                  renamingSession={renamingSession} renameSessionVal={renameSessionVal}
                  setRenamingSession={setRenamingSession} setRenameSessionVal={setRenameSessionVal}
                  renameSession={renameSession} renameSessionInputRef={renameSessionInputRef}
                  ignoreRenameSessionBlurRef={ignoreRenameSessionBlurRef}
                  dStart={dStart} dEnd={dEnd} dOver={dOver} dLeave={dLeave}
                  dropOnGroup={dropOnGroup} dropOnSession={dropOnSession} isDO={isDO}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {contextMenu && (
        <CtxMenu ctx={contextMenu} closeCtx={closeCtx}
          onConnectSaved={onConnectSaved} onNewSession={onNewSession}
          dupSession={dupSession} deleteSession={deleteSession} deleteGroup={deleteGroup}
          setRenaming={setRenaming} setRenameVal={setRenameVal}
          groupPlaceholders={groupPlaceholders} onUpdatePlaceholders={onUpdatePlaceholders}
          expandAll={expandAll} collapseAll={collapseAll}
          expandGroupAll={expandGroupAll} collapseGroupAll={collapseGroupAll}
          setRenamingSession={setRenamingSession} setRenameSessionVal={setRenameSessionVal}
        />
      )}
    </div>
  )
}

function TreeNode({ node, depth, isExp, togExp, openCtx, onConnectSaved,
  renaming, renameVal, setRenameVal, setRenaming, renameGroup,
  renameGroupInputRef, ignoreRenameGroupBlurRef,
  renamingSession, renameSessionVal, setRenamingSession, setRenameSessionVal, renameSession, renameSessionInputRef,
  ignoreRenameSessionBlurRef,
  dStart, dEnd, dOver, dLeave, dropOnGroup, dropOnSession, isDO }) {
  const indent = depth * 14 + 6
  if (node.type === 'group') {
    const open = isExp(node.path)
    const isDropTarget = isDO(node.id, 'group')
    return (
      <div className="sb-node-group">
        <div
          className={`sb-row sb-folder-row${isDropTarget ? ' drop-target' : ''}`}
          style={{ paddingLeft: indent }}
          onClick={() => togExp(node.path)}
          onContextMenu={e => openCtx(e, 'group', node.path)}
          draggable
          onDragStart={e => dStart(e, node.id, 'group')}
          onDragEnd={dEnd}
          onDragOver={e => dOver(e, node.id, 'group')}
          onDragLeave={dLeave}
          onDrop={e => dropOnGroup(e, node.path)}>
          <span className={`sb-chevron${open ? ' open' : ''}`}><Chevron /></span>
          <span className="sb-folder-icon" style={{ color: open ? '#e8bf6a' : '#c4a35a' }}><FolderIcon open={open} /></span>
          {renaming === node.path ? (
            <input className="sb-rename-input" value={renameVal} autoFocus ref={renameGroupInputRef}
              onClick={e => e.stopPropagation()}
              onChange={e => setRenameVal(e.target.value)}
              onBlur={() => {
                if (ignoreRenameGroupBlurRef.current) return
                renameGroup(node.path, renameVal)
              }}
              onKeyDown={e => { if (e.key === 'Enter') renameGroup(node.path, renameVal); if (e.key === 'Escape') setRenaming(null) }} />
          ) : (
            <span className="sb-label">{node.name}</span>
          )}
          <span className="sb-count">{node.children.length}</span>
        </div>
        {open && node.children.map(child => (
          <TreeNode key={child.id} node={child} depth={depth + 1}
            isExp={isExp} togExp={togExp} openCtx={openCtx} onConnectSaved={onConnectSaved}
            renaming={renaming} renameVal={renameVal} setRenameVal={setRenameVal}
            setRenaming={setRenaming} renameGroup={renameGroup}
            renameGroupInputRef={renameGroupInputRef} ignoreRenameGroupBlurRef={ignoreRenameGroupBlurRef}
            renamingSession={renamingSession} renameSessionVal={renameSessionVal}
            setRenamingSession={setRenamingSession} setRenameSessionVal={setRenameSessionVal}
            renameSession={renameSession} renameSessionInputRef={renameSessionInputRef}
            ignoreRenameSessionBlurRef={ignoreRenameSessionBlurRef}
            dStart={dStart} dEnd={dEnd} dOver={dOver} dLeave={dLeave}
            dropOnGroup={dropOnGroup} dropOnSession={dropOnSession} isDO={isDO} />
        ))}
      </div>
    )
  }
  const s = node.session
  const isDropTarget = isDO(node.id, 'session')
  const isRenamingThis = renamingSession === s.savedId
  return (
    <div
      className={`sb-row sb-session-row${isDropTarget ? ' drop-target' : ''}`}
      style={{ paddingLeft: indent + 18 }}
      draggable={!isRenamingThis}
      onDragStart={e => dStart(e, node.id, 'session')}
      onDragEnd={dEnd}
      onDragOver={e => dOver(e, node.id, 'session')}
      onDragLeave={dLeave}
      onDrop={e => dropOnSession(e, node.id, s.group || '')}
      onClick={() => !isRenamingThis && onConnectSaved(s)}
      onContextMenu={e => openCtx(e, 'session', s)}
      title={`${s.type?.toUpperCase()} ${s.host || s.path || ''}`}>
      <span className="sb-session-icon" style={{ color: TYPE_COLORS[s.type] }}>{TYPE_ICONS[s.type]}</span>
      {isRenamingThis ? (
        <input className="sb-rename-input" value={renameSessionVal} autoFocus ref={renameSessionInputRef}
          onClick={e => e.stopPropagation()}
          onChange={e => setRenameSessionVal(e.target.value)}
          onBlur={() => {
            if (ignoreRenameSessionBlurRef.current) return
            renameSession(s.savedId, renameSessionVal)
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') renameSession(s.savedId, renameSessionVal)
            if (e.key === 'Escape') setRenamingSession(null)
          }} />
      ) : (
        <span className="sb-label">{s.label || node.name}</span>
      )}
      {s.enableSftp && !isRenamingThis && <span className="sb-sftp-badge" title="SFTP">⇅</span>}
    </div>
  )
}

/**
 * 侧边栏顶部：包含展开/收起按钮和设置按钮
 *  @param {object} props 组件属性
 *  @param {boolean} props.open 侧边栏是否展开
 *  @param {function} props.onToggle 切换侧边栏展开/收起的回调函数
 *  @param {function} props.onOpenSettings 打开设置界面的回调函数
 *  @returns {JSX.Element} 侧边栏顶部组件
 */
function SidebarTop({ open, onToggle, onOpenSettings }) {
  return (
    <div className="sidebar-top">
      <button className="sidebar-toggle" onClick={onToggle} title={open ? '收起' : '展开'}>
        <svg width="18" height="18" viewBox="0 0 16 16">
          {open
            ? <path d="M6 2L2 8L6 14M10 2L6 8L10 14" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
            : <path d="M10 2L14 8L10 14M6 2L10 8L6 14" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>}
        </svg>
      </button>
      {open && <button className="sidebar-settings-btn" title="设置" onClick={onOpenSettings}>⚙</button>}
    </div>
  )
}

function CtxMenu({ ctx, closeCtx, onConnectSaved, onNewSession, dupSession, deleteSession, deleteGroup, setRenaming, setRenameVal, groupPlaceholders, onUpdatePlaceholders, expandAll, collapseAll, expandGroupAll, collapseGroupAll, setRenamingSession, setRenameSessionVal }) {
  const [subInput, setSubInput] = React.useState(null)
  const [newGroupInput, setNewGroupInput] = React.useState(null)
  const subInputRef = useRef(null)
  const newGroupInputRef = useRef(null)
  if (subInput !== null) {
    return (
      <div className="context-menu context-menu-input" style={{ top: ctx.y, left: ctx.x }} onClick={e => e.stopPropagation()}>
        <div className="context-menu-input-label">子分组名称：</div>
        <input className="context-menu-input-field" value={subInput} autoFocus placeholder="输入名称..." ref={subInputRef}
          onChange={e => setSubInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const trimmed = subInput.trim()
              if (!trimmed) { alert('分组名不能为空'); return }
              if (INVALID_LABEL_CHARS.test(trimmed)) { alert('分组名不允许包含以下字符：/ \\ : * ? " < > |'); return }
              onUpdatePlaceholders?.(addGroupPlaceholder(groupPlaceholders, `${ctx.data}/${trimmed}`))
              setSubInput(null); closeCtx()
            }
            if (e.key === 'Escape') { setSubInput(null); closeCtx() }
          }} />
        <div className="context-menu-input-actions">
          <button onClick={() => { setSubInput(null); closeCtx() }}>取消</button>
          <button className="confirm" onClick={() => {
            const trimmed = subInput.trim()
            if (!trimmed) { alert('分组名不能为空'); subInputRef.current?.focus(); return }
            if (INVALID_LABEL_CHARS.test(trimmed)) { alert('分组名不允许包含以下字符：/ \\ : * ? " < > |'); subInputRef.current?.focus(); return }
            onUpdatePlaceholders?.(addGroupPlaceholder(groupPlaceholders, `${ctx.data}/${trimmed}`))
            setSubInput(null); closeCtx()
          }}>确定</button>
        </div>
      </div>
    )
  }

  if (newGroupInput !== null) {
    return (
      <div className="context-menu context-menu-input" style={{ top: ctx.y, left: ctx.x }} onClick={e => e.stopPropagation()}>
        <div className="context-menu-input-label">分组名称：</div>
        <input className="context-menu-input-field" value={newGroupInput} autoFocus placeholder="输入名称..." ref={newGroupInputRef}
          onChange={e => setNewGroupInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const trimmed = newGroupInput.trim()
              if (!trimmed) { alert('分组名不能为空'); return }
              if (INVALID_LABEL_CHARS.test(trimmed)) { alert('分组名不允许包含以下字符：/ \\ : * ? " < > |'); return }
              onUpdatePlaceholders?.(addGroupPlaceholder(groupPlaceholders, trimmed))
              setNewGroupInput(null); closeCtx()
            }
            if (e.key === 'Escape') { setNewGroupInput(null); closeCtx() }
          }} />
        <div className="context-menu-input-actions">
          <button onClick={() => { setNewGroupInput(null); closeCtx() }}>取消</button>
          <button className="confirm" onClick={() => {
            const trimmed = newGroupInput.trim()
            if (!trimmed) { alert('分组名不能为空'); newGroupInputRef.current?.focus(); return }
            if (INVALID_LABEL_CHARS.test(trimmed)) { alert('分组名不允许包含以下字符：/ \\ : * ? " < > |'); newGroupInputRef.current?.focus(); return }
            onUpdatePlaceholders?.(addGroupPlaceholder(groupPlaceholders, trimmed))
            setNewGroupInput(null); closeCtx()
          }}>确定</button>
        </div>
      </div>
    )
  }
  return (
    <div className="context-menu" style={{ top: ctx.y, left: ctx.x }} onClick={e => e.stopPropagation()}>
      {ctx.type === 'sessions-header' && (<>
        <button onClick={() => { onNewSession('ssh'); closeCtx() }}>新建连接</button>
        <button onClick={() => setNewGroupInput('')}>新建分组</button>
        <div className="context-menu-divider" />
        <button onClick={() => { expandAll(); closeCtx() }}>展开所有</button>
        <button onClick={() => { collapseAll(); closeCtx() }}>收起所有</button>
      </>)}
      {ctx.type === 'session' && (<>
        <button onClick={() => { onConnectSaved(ctx.data); closeCtx() }}>连接</button>
        <button onClick={() => { onNewSession(ctx.data.type, ctx.data); closeCtx() }}>编辑</button>
        <button onClick={() => { setRenamingSession(ctx.data.savedId); setRenameSessionVal(ctx.data.label || ''); closeCtx() }}>重命名</button>
        <button onClick={() => { dupSession(ctx.data.savedId); closeCtx() }}>复制</button>
        <button className="danger" onClick={() => { deleteSession(ctx.data.savedId, ctx.data.label); closeCtx() }}>删除</button>
      </>)}
      {ctx.type === 'group' && (<>
        <button onClick={() => { onNewSession('ssh', { group: ctx.data }); closeCtx() }}>新建会话</button>
        <button onClick={() => { setRenaming(ctx.data); setRenameVal(ctx.data.split('/').pop()); closeCtx() }}>重命名</button>
        <button onClick={() => setSubInput('')}>新建子分组</button>
        <button onClick={() => { expandGroupAll(ctx.data); closeCtx() }}>展开该分组所有子项</button>
        <button onClick={() => { collapseGroupAll(ctx.data); closeCtx() }}>收起该分组所有子项</button>
        <button className="danger" onClick={() => { deleteGroup(ctx.data); closeCtx() }}>删除分组</button>
      </>)}
    </div>
  )
}

function SftpTree({ items, currentPath, onNavigate, onGoUp, onJumpTo, onDrop }) {
  const canGoUp = currentPath && currentPath !== '/'
  const hDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }
  const hDrop = (e, item) => { e.preventDefault(); const f = Array.from(e.dataTransfer.files); if (f.length > 0 && onDrop) onDrop(f, item) }
  const segments = currentPath ? currentPath.split('/').filter(Boolean) : []
  return (
    <div className="sftp-tree">
      <div className="sftp-tree-breadcrumb" title={currentPath || '/'}>
        <span className={`sftp-crumb${segments.length === 0 ? ' active' : ''}`} onClick={() => onJumpTo?.('/')}>/</span>
        {segments.map((seg, i) => {
          const path = '/' + segments.slice(0, i + 1).join('/')
          return (
            <span key={path} className="sftp-crumb-group">
              <span className="sftp-crumb-sep">›</span>
              <span className={`sftp-crumb${i === segments.length - 1 ? ' active' : ''}`} onClick={() => onJumpTo?.(path)}>{seg}</span>
            </span>
          )
        })}
      </div>
      {canGoUp && <div className="sftp-tree-item dir go-up" onClick={onGoUp}><span className="sftp-tree-icon">↩</span><span className="sftp-tree-name">..</span></div>}
      {!items && <div className="sidebar-loading-text">加载中...</div>}
      {items && items.length === 0 && <div className="sidebar-empty-dir">（空目录）</div>}
      {items && items.map(item => (
        <div key={item.path} className={`sftp-tree-item ${item.isDir ? 'dir' : 'file'}`}
          onClick={() => item.isDir && onNavigate(item)}
          onDragOver={item.isDir ? hDragOver : undefined}
          onDrop={item.isDir ? e => hDrop(e, item) : undefined}
          draggable={!item.isDir}
          onDragStart={!item.isDir ? e => e.dataTransfer.setData('text/plain', item.path) : undefined}
          title={item.path}>
          <span className="sftp-tree-icon">{item.isDir ? '📁' : '📄'}</span>
          <span className="sftp-tree-name">{item.name}</span>
        </div>
      ))}
    </div>
  )
}
