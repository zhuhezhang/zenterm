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
 * @returns {array} 构建按照名称排序好的会话树结构（根层包含：顶级分组 + 未分组会话），每个节点包含 id、type、name、path 和 children 属性
 * @example
 * const tree = buildTree(savedSessions, groupPlaceholders)
 * console.log(tree)
 * // [
 * //   { id: '这是顶级分组', type: 'group', name: '这是顶级分组', path: '这是顶级分组', children: [{未分组会话节点属性（id、type、name、path 和 session）}] },
 * //   { id: 'group1', type: 'group', name: 'group1', path: 'group1', children: [{该顶级分组下的所有属性树结构（分组、会话）}] },
 * //   { id: 'saved-1774879238543-ui6r', type: 'session', name: '会话名字', session: {session属性字段} }{
 * // ]
 */
function buildTree(savedSessions, groupPlaceholders) {
  const groupMap = {}  // 临时存储分组节点，key 是分组路径，value 是分组对象
  /** 
   * 获取或创建分组节点，如果不存在则创建一个新的分组节点并添加到 groupMap 中，同时处理父分组关系
   * @param {string} path 分组路径，例如 "分组1/子分组A"
   * @returns {object} 分组节点对象，包含 id、type、name、path 和 children 属性
   * @example
   * const node = getOrCreate('group1/subgroup1')
   * console.log(node)
   * // { id: 'group1/subgroup1', type: 'group', name: 'subgroup1', path: 'group1/subgroup1', children: [] }
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
  groupPlaceholders.forEach(g => getOrCreate(g))  // 先处理分组占位符（没有会话属于该分组），确保所有占位分组节点都被创建
  savedSessions.forEach(s => { if (s.group) getOrCreate(s.group) })  // 处理已保存的会话，确保所有已保存会话所属的分组节点都被创建
  const ungrouped = []
  savedSessions.forEach(s => {  // 把会话挂到对应分组；无分组会话放到根
    const sessNode = { id: s.savedId, type: 'session', name: s.label || s.host || s.id, session: s }
    if (s.group && groupMap[s.group]) groupMap[s.group].children.push(sessNode)  // 若 s.group 存在且对应分组节点存在 -> push 到该分组 children
    else ungrouped.push(sessNode)  // 否则放进 ungrouped（根级未分组会话）
  })
  const rootGroups = Object.values(groupMap).filter(n => !n.path.includes('/'))  // 拿到根分组：rootGroups = groupMap 中路径不含 / 的分组（顶级分组）

  const sortNodes = (nodes) => {  // 分组和会话分别按名称排序
    const groups = nodes.filter(n => n.type === 'group').sort((a, b) => a.name.localeCompare(b.name))
    const sessions = nodes.filter(n => n.type === 'session').sort((a, b) => a.name.localeCompare(b.name))
    groups.forEach(g => { g.children = sortNodes(g.children) })
    return [...groups, ...sessions]
  }
  return sortNodes([...rootGroups, ...ungrouped])
}

/**
 * 侧边栏组件
 * @param {object} props 组件属性
 * @param {boolean} props.open 侧边栏是否展开
 * @param {function} props.onToggle 切换侧边栏展开/收起的回调函数
 * @param {array} props.savedSessions 已保存的会话列表
 * @param {function} props.onNewSession 新建会话的回调函数
 * @param {function} props.onConnectSaved 连接会话的回调函数
 * @param {function} props.onDeleteSaved 删除会话的回调函数
 * @param {function} props.onUpdateSessions 更新会话的回调函数
 * @param {string} props.activeSftpSessionId 当前活动的 SFTP 会话 ID
 * @param {array} props.sftpFiles SFTP 文件列表
 * @param {string} props.sftpPath SFTP 当前路径
 * @param {boolean} props.sftpLoading SFTP 加载状态
 * @param {function} props.onSftpNavigate SFTP 导航的回调函数
 * @param {function} props.onSftpGoUp SFTP 上级的回调函数
 * @param {function} props.onSftpJumpTo SFTP 跳转的回调函数
 * @param {function} props.onSftpDrop SFTP 拖拽的回调函数
 * @param {object} props.settings 设置
 * @param {function} props.onOpenSettings 打开设置界面的回调函数
 * @param {object} props.style 侧边栏样式
 * @param {array} props.groupPlaceholders 分组占位符列表
 * @param {function} props.onUpdatePlaceholders 更新分组占位符的回调函数
 * @returns {JSX.Element} 侧边栏组件
 */
export default function Sidebar(props) {
  const {
    open, onToggle, savedSessions, onNewSession, onConnectSaved,
    onDeleteSaved, onUpdateSessions, activeSftpSessionId,
    sftpFiles, sftpPath, sftpLoading, onSftpNavigate, onSftpGoUp,
    onSftpJumpTo, onSftpDrop, settings, onOpenSettings, style,
    groupPlaceholders = [], onUpdatePlaceholders,
  } = props

  const [expanded, setExpanded] = useState({})  // 展开状态，key 是分组路径，value 是是否展开
  const [sessionsCollapsed, setSessionsCollapsed] = useState(false)  // 会话是否收起
  const [contextMenu, setContextMenu] = useState(null)  // 上下文菜单状态，包含 x、y 坐标、类型和数据
  const [renaming, setRenaming] = useState(null)  // 重命名状态，包含路径和新的名称
  const [renameVal, setRenameVal] = useState('')  // 重命名输入值
  const [renamingSession, setRenamingSession] = useState(null)  // 重命名会话状态，包含 savedId 和新的标签
  const [renameSessionVal, setRenameSessionVal] = useState('')  // 重命名会话输入值
  const [sftpExpanded, setSftpExpanded] = useState(true)  // SFTP 是否展开
  const [dragOver, setDragOver] = useState(null)  // 拖拽状态，包含 id 和 zone
  const dragRef = useRef(null)  // 拖拽引用
  const renameGroupInputRef = useRef(null)  // 重命名分组输入引用
  const renameGroupAlertingRef = useRef(false)  // 重命名分组警告引用
  const ignoreRenameGroupBlurRef = useRef(false)  // 重命名分组忽略 blur 引用（blur 事件也就是失去焦点事件）
  const renameSessionInputRef = useRef(null)  // 重命名会话输入引用
  const renameSessionAlertingRef = useRef(false)  // 重命名会话警告引用
  const ignoreRenameSessionBlurRef = useRef(false)  // 重命名会话忽略 blur 引用

  /**
   * 是否展开
   * @param {string} path 分组路径
   * @returns {boolean} 是否展开
   */
  const isExp = (path) => expanded[path] === true
  /**
   * 切换展开状态
   * @param {string} path 分组路径
   */
  const togExp = (path) => setExpanded(p => ({ ...p, [path]: !isExp(path) }))
  /**
   * 打开上下文菜单
   * @param {Event} e 事件
   * @param {string} type 类型
   * @param {any} data 数据
   */
  const openCtx = (e, type, data) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, type, data }) }
  /** 关闭上下文菜单 */
  const closeCtx = () => setContextMenu(null)

  /** 展开所有分组 */
  const expandAll = () => {
    const all = {}  // 展开状态，key 是分组路径，value 是是否展开
    const collectGroups = (nodes) => nodes.forEach(n => { if (n.type === 'group') { all[n.path] = true; collectGroups(n.children) } })
    collectGroups(buildTree(savedSessions, groupPlaceholders))  // 收集所有分组路径
    setExpanded(all)  // 设置展开状态
    setSessionsCollapsed(false)  // 设置会话不收起
  }
  /** 收起所有分组 */
  const collapseAll = () => {
    setExpanded({})  // 设置展开状态为空
    setSessionsCollapsed(false)  // 设置会话不收起
  }

  /** 
   * 展开该分组所有子项
   * @param {string} groupPath 分组路径
   */
  const expandGroupAll = (groupPath) => {
    const all = {}  // 展开状态，key 是分组路径，value 是是否展开
    const collectGroups = (nodes) => nodes.forEach(n => { if (n.type === 'group') { all[n.path] = true; collectGroups(n.children) } })  // 收集所有分组路径
    const walk = (nodes) => {  // 遍历所有分组，收集该分组及其子项的路径
      for (const n of nodes) {
        if (n.type !== 'group') continue
        if (n.path === groupPath) {  // 如果当前分组是目标分组，收集该分组及其子项
          collectGroups([n])
          return true
        }
        if (walk(n.children)) return true  // 递归收集子项
      }
      return false
    }
    walk(buildTree(savedSessions, groupPlaceholders))
    setExpanded(prev => ({ ...prev, ...all }))  // 设置展开状态
    setSessionsCollapsed(false)
  }

  /** 
   * 收起该分组所有子项
   * @param {string} groupPath 分组路径
   */
  const collapseGroupAll = (groupPath) => {
    setExpanded(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(k => {
        if (k === groupPath || k.startsWith(groupPath + '/')) next[k] = false
      })
      return next
    })
  }

  /** 
   * 重命名分组
   * @param {string} oldPath 旧路径
   * @param {string} newName 新名称
   */
  const renameGroup = (oldPath, newName) => {
    const trimmed = newName.trim()
    if (!trimmed) { setRenaming(null); return }  // 如果新名称是空，取消编辑，不做任何重命名（也不弹提示）
    if (INVALID_LABEL_CHARS.test(trimmed)) {  // 非法字符校验 + 弹窗后重新聚焦输入框
      if (renameGroupAlertingRef.current) return
      renameGroupAlertingRef.current = true  // 设置警告状态，避免 alert 触发的事件链（blur/focus）导致重复弹窗
      ignoreRenameGroupBlurRef.current = true  // 设置忽略 blur 状态（blur 事件也就是失去焦点事件）
      alert('分组名不允许包含以下字符：/ \\ : * ? " < > |')
      renameGroupAlertingRef.current = false
      setTimeout(() => {  // 等当前调用栈结束后再 focus()，确保浏览器/React 状态稳定，焦点能正确回到输入框
        renameGroupInputRef.current?.focus()
        ignoreRenameGroupBlurRef.current = false
      }, 0)
      return
    }

    const oldName = oldPath.split('/').pop()
    if (trimmed === oldName) { setRenaming(null); return }  // 如果新名称与旧名称相同，取消编辑，不做任何重命名
    const parts = oldPath.split('/')  // 计算父路径（用于“同级”冲突检测）
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : ''  // 若 oldPath = "B/A"，父路径是 "B"；若 oldPath = "A"，父路径是空（代表根）
    const usedSiblingNames = new Set()  // 同父分组下的所有子分组名字（不含自己这棵树）
    const all = new Set([...groupPlaceholders, ...savedSessions.map(s => s.group).filter(Boolean)])  // 所有占位分组和会话的已用分组名称集合
    for (const p of all) {  // 遍历所有已用分组名称，检查是否与新名称冲突
      if (p === oldPath || p.startsWith(oldPath + '/')) continue  // 如果 p 是 oldPath 或 oldPath 的子路径，跳过
      if (parentPath) {  // 如果父路径存在（非根分组）
        if (!p.startsWith(parentPath + '/')) continue  // 只关心同一个父分组下面的路径
        const rest = p.slice(parentPath.length + 1)  // 取父分组下第一段，得到“同级分组名”：例：p="B/A/xx" → rest="A/xx" → child="A"
        const child = rest.split('/')[0]
        if (child) usedSiblingNames.add(child)  // 如果子名称存在，添加到集合中
      } else {  // 如果父路径不存在（根分组）
        const child = p.split('/')[0]
        if (child) usedSiblingNames.add(child)
      }
    }

    let uniqueName = trimmed
    if (usedSiblingNames.has(uniqueName)) {  // 如果新名称与已用名称冲突，则自动添加 (1)、(2) 等后缀
      let i = 1
      while (usedSiblingNames.has(`${trimmed}(${i})`)) i++
      uniqueName = `${trimmed}(${i})`
    }
    parts[parts.length - 1] = uniqueName
    const newPath = parts.join('/')  // 构建新的分组路径
    onUpdateSessions(savedSessions.map(s =>
      s.group === oldPath ? { ...s, group: newPath } :
      s.group?.startsWith(oldPath + '/') ? { ...s, group: newPath + s.group.slice(oldPath.length) } : s
    ))  // 批量更新所有会话的 group 路径（包含子树）
    onUpdatePlaceholders?.(groupPlaceholders.map(g =>
      g === oldPath ? newPath : g.startsWith(oldPath + '/') ? newPath + g.slice(oldPath.length) : g
    ))  // 更新占位分组（用于下次新增分组时自动补全）
    setRenaming(null)  // 清掉“当前正在重命名哪个分组”的状态，UI 回到正常显示
  }

  /** 
   * 删除分组
   * @param {string} path 分组路径
   */
  const deleteGroup = (path) => {
    const w = settings?.deleteGroupWithSessions  // 是否删除分组时连带删除其下的所有会话
    const name = path.split('/').pop()  // 获取分组名称
    const msg = w ? `删除分组「${name}」及其所有内容？` : `删除分组「${name}」？组内会话将变为未分组。`
    if (settings?.confirmDeleteGroup !== false && !confirm(msg)) return  // 如果配置了不确认删除，则不删除
    if (w)  // 如果配置了删除分组时连带删除其下的所有会话，则删除所有会话
      onUpdateSessions(savedSessions.filter(s => s.group !== path && !s.group?.startsWith(path + '/')))
    else // 如果配置了不删除分组时连带删除其下的所有会话，则将所有会话的 group 路径设置为空
      onUpdateSessions(savedSessions.map(s => (s.group === path || s.group?.startsWith(path + '/')) ? { ...s, group: '' } : s))
    onUpdatePlaceholders?.(groupPlaceholders.filter(g => g !== path && !g.startsWith(path + '/')))  // 更新占位分组（用于下次新增分组时自动补全）
  }

  /** 
   * 删除会话
   * @param {string} id 会话 ID
   * @param {string} label 会话名称
   */
  const deleteSession = (id, label) => {
    if (settings?.confirmDeleteSession !== false && !confirm(`删除会话「${label}」？`)) return  // 如果配置了不确认删除，则不删除
    onDeleteSaved(id)
  }

  /** 
   * 复制会话
   * @param {string} id 要复制的会话 ID
   */
  const dupSession = (id) => onUpdateSessions(duplicateSavedSession(savedSessions, id))

  /** 
   * 重命名会话
   * @param {string} savedId 会话 ID
   * @param {string} newLabel 新名称
   */
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
