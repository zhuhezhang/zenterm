import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../context/I18nContext.jsx'
import { addGroupPlaceholder, exportSessions, importSessions, uniqueLabelInGroup, ungroupSessionsUnderPath, vacatedNamedGroupIfEmpty } from '../store/sessionStore.js'
import { formatImportError } from '../lib/import/handleImportErrors.js'
import { mergeImportedSessions } from '../lib/import/mergeImportedSessions.js'
import { formatSessionImportWarnings } from '../lib/session/importWarnings.js'
import { absorbPlaintextSecretsFromImportedSessions } from '../store/credentialsBridge.js'
import SftpPanel from './SftpPanel.jsx'
import ConnectionTypeIcon from './common.jsx'
import '../styles/sidebar.css'

/** 连接类型颜色映射 */
const TYPE_COLORS = { ssh: '#58a6ff', telnet: '#3fb950', serial: '#ffa657' }
/** 搜索时 buildTree 不注入占位分组，避免无匹配会话下出现空分组树 */
const NO_GROUP_PLACEHOLDERS = []
/** 名称非法字符正则表达式 */
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
  <svg width="18" height="23" viewBox="0 0 16 16" fill="currentColor" opacity="0.85">
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
 * @param {function} props.onDuplicateSaved 复制已保存会话（含主进程加密凭据）的回调，参数为 savedId
 * @param {object|null} props.activeSession 当前活动会话对象（用于 SFTP 面板）
 * @param {object} props.settings 设置
 * @param {function} props.onOpenSettings 打开设置界面的回调函数
 * @param {object} props.style 侧边栏样式
 * @param {array} props.groupPlaceholders 分组占位符列表
 * @param {function} props.onUpdatePlaceholders 更新分组占位符的回调函数
 * @returns {JSX.Element} 侧边栏组件
 */
export default function Sidebar(props) {
  const {
    open, onToggle, savedSessions, onNewSession, onConnectSaved, onDeleteSaved, onUpdateSessions,
    onDuplicateSaved = () => {},
    activeSession, settings, onOpenSettings, style, groupPlaceholders = [], onUpdatePlaceholders,
  } = props

  const { t } = useI18n()
  const [expanded, setExpanded] = useState({})  // 展开状态，key 是分组路径，value 是是否展开
  const [sessionsCollapsed, setSessionsCollapsed] = useState(false)  // 会话是否收起
  const [contextMenu, setContextMenu] = useState(null)  // 上下文菜单状态，包含 x、y 坐标、类型和数据
  const [renaming, setRenaming] = useState(null)  // 重命名状态，包含路径和新的名称
  const [renameVal, setRenameVal] = useState('')  // 重命名输入值
  const [renamingSession, setRenamingSession] = useState(null)  // 重命名会话状态，包含 savedId 和新的标签
  const [renameSessionVal, setRenameSessionVal] = useState('')  // 重命名会话输入值
  const [sftpExpanded, setSftpExpanded] = useState(true)  // SFTP 是否展开
  const [sessionSearchQuery, setSessionSearchQuery] = useState('')  // 会话搜索查询(按会话名、主机或串口路径搜索已保存会话)
  const [dragOver, setDragOver] = useState(null)  // 被拖拽对象所在实时位置，包含id和zone，也就是拖拽分组/会话时经过的分组路径或会话id和 zone（group/session/drop(表示被拖拽对象在根分组上方)）
  const dragRef = useRef(null)  // 被拖拽分组/会话的分组路径或者会话id和type（group/session）
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

  /** 导入会话的文件输入引用 */
  const importSessionsFileRef = useRef(null)
  /** 与设置页「导入会话」一致：合并 JSON 中的会话并尽量将明文敏感字段吸入 vault */
  const handleImportSessionsFile = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const beforeCount = savedSessions.length
      const { sessions: imported, warnings: parseWarnings } = await importSessions(file)
      const mergeWarnings = []
      const merged = mergeImportedSessions(savedSessions, imported, mergeWarnings)
      const sanitized = await absorbPlaintextSecretsFromImportedSessions(merged)
      onUpdateSessions(sanitized)
      const n = sanitized.length - beforeCount
      const allWarnings = [...parseWarnings, ...mergeWarnings]
      if (allWarnings.length) {
        alert(t('settings.importSessionsPartial', {
          n,
          details: formatSessionImportWarnings(t, allWarnings),
        }))
      } else {
        alert(t('settings.importSessionsOk', { n }))
      }
    } catch (err) {
      alert(t('settings.importFail', { msg: formatImportError(t, err) }))
    }
    e.target.value = ''
  }, [savedSessions, onUpdateSessions, t])

  useEffect(() => {  // 右键菜单打开后，点击菜单外区域自动关闭
    if (!contextMenu) return
    const onDocMouseDown = (e) => {
      if (e.target?.closest?.('.context-menu')) return
      closeCtx()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [contextMenu])

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
      alert(t('sidebar.renameGroupInvalid'))
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
      } else {  // 如果父路径不存在（根分组），获取所有分组路径下的根分组下的子分组名称
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
    const msg = w ? t('sidebar.deleteGroupWithKids', { name }) : t('sidebar.deleteGroupOnly', { name })
    if (settings?.confirmDeleteGroup !== false && !confirm(msg)) return  // 如果配置了不确认删除，则不删除
    if (w)  // 如果配置了删除分组时连带删除其下的所有会话，则删除所有会话
      onUpdateSessions(savedSessions.filter(s => s.group !== path && !s.group?.startsWith(path + '/')))
    else // 不删除会话：移为未分组，并与已有未分组会话去重标签名
      onUpdateSessions(ungroupSessionsUnderPath(savedSessions, path))
    onUpdatePlaceholders?.(groupPlaceholders.filter(g => g !== path && !g.startsWith(path + '/')))  // 更新占位分组（用于下次新增分组时自动补全）
  }

  /** 
   * 删除会话
   * @param {string} id 会话 ID
   * @param {string} label 会话名称
   */
  const deleteSession = (id, label) => {
    if (settings?.confirmDeleteSession !== false && !confirm(t('sidebar.deleteSession', { label }))) return  // 如果配置了不确认删除，则不删除
    onDeleteSaved(id)
  }

  /** 
   * 复制会话
   * @param {string} id 要复制的会话 ID
   */
  const dupSession = (id) => onDuplicateSaved(id)

  /** 
   * 重命名会话
   * @param {string} 要重命名的会话的savedId 会话 ID
   * @param {string} newLabel 新名称
   */
  const renameSession = (savedId, newLabel) => {
    const trimmed = newLabel.trim()
    if (!trimmed) {
      setRenamingSession(null)  // 空标签：恢复原标签，不做任何重命名（也不弹提示）
      return
    }
    if (INVALID_LABEL_CHARS.test(trimmed)) {  // 非法字符校验 + 弹窗后重新聚焦输入框
      if (renameSessionAlertingRef.current) return
      renameSessionAlertingRef.current = true  // 设置警告状态，避免 alert 触发的事件链（blur/focus）导致重复弹窗
      ignoreRenameSessionBlurRef.current = true  // 设置忽略 blur 状态（blur 事件也就是失去焦点事件）
      alert(t('sidebar.renameSessionInvalid'))
      renameSessionAlertingRef.current = false  // 设置警告状态为 false，避免重复弹窗
      setTimeout(() => {  // 等当前调用栈结束后再 focus()，确保浏览器/React 状态稳定，焦点能正确回到输入框
        renameSessionInputRef.current?.focus()
        ignoreRenameSessionBlurRef.current = false
      }, 0)
      return
    }
    const target = savedSessions.find(s => s.savedId === savedId)
    if (!target || trimmed === target.label) { setRenamingSession(null); return }
    const uniqueLabel = uniqueLabelInGroup(savedSessions, target.group, trimmed, savedId)  // 使用 uniqueLabelInGroup 确保唯一性
    onUpdateSessions(savedSessions.map(s => s.savedId === savedId ? { ...s, label: uniqueLabel } : s))
    setRenamingSession(null)
  }

  /** 
   * 开始拖拽
   * @param {Event} e 事件
   * @param {string} id 拖拽对象 ID
   * @param {string} type 拖拽对象类型，'session' 或 'group'
   */
  const dStart = (e, id, type) => {
    dragRef.current = { id, type }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    e.stopPropagation()
  }
  /**
   * 拖拽经过
   * @param {Event} e 事件
   * @param {string} id 拖拽对象 ID
   * @param {string} zone 拖拽区域，'group' 或 'session' 或 'ungroup'
   */
  const dOver = (e, id, zone) => {
    e.preventDefault(); e.stopPropagation()
    setDragOver(prev => (prev?.id === id && prev?.zone === zone) ? prev : { id, zone })  // 设置拖拽区域
  }
  /**
   * 拖拽离开
   * @param {Event} e 事件
   */
  const dLeave = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null) }
  /** 结束拖拽 */
  const dEnd = () => { dragRef.current = null; setDragOver(null) }
  
  /**
   * 当前被拖拽对象是否在某个ID和拖拽区域
   * @param {string} id 拖拽对象 ID
   * @param {string} zone 拖拽区域，'group' 或 'session' 或 'ungroup'
   */
  const isDO = (id, zone) => dragOver?.id === id && dragOver?.zone === zone
  /**
   * 收集所有分组路径
   * @returns {Set<string>} 所有分组路径集合
   */
  const collectAllGroupPaths = () => {
    const all = new Set(groupPlaceholders)  // 所有占位分组
    savedSessions.forEach(s => { if (s.group) all.add(s.group) })  // 所有会话的 group 路径
    return all  // 所有分组路径集合
  }
  /** 
   * 确保分组名称在父分组下唯一
   * @param {string} parentPath 父分组路径
   * @param {string} preferredName 首选名称
   * @param {string} movingGroupPath 移动中的分组路径
   * @returns {string} 唯一名称，如果首选名称已存在，则返回首选名称(1)、(2) 等后缀
   */
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

  /**
   * 拖拽到分组
   * @param {Event} e 事件
   * @param {string} groupPath 目标分组路径
   */
  const dropOnGroup = (e, groupPath) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(null)
    const src = dragRef.current; if (!src) return
    if (src.type === 'session') {  // 会话拖拽到分组，检查是否有同名会话
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

      const next = savedSessions.map(s => s.savedId === src.id ? { ...s, group: groupPath, label: newLabel } : s)  // 更新会话的 group 路径和标签名
      const v = vacatedNamedGroupIfEmpty(movedSession.group, next)
      onUpdateSessions(next, v ? { placeholderForVacatedGroup: v } : undefined)  // 更新会话列表，如果需要恢复为占位分组，则设置占位分组
    } else if (src.type === 'group' && src.id !== groupPath && !groupPath.startsWith(src.id + '/')) {  // 分组拖拽到分组，检查是否有同名分组
      const oldPath = src.id  // 获取源分组路径
      const preferredName = oldPath.split('/').pop()  // 获取源分组名称
      const targetName = uniqueGroupNameUnder(groupPath, preferredName, oldPath)  // 确保目标分组名称在父分组下唯一
      const newPath = groupPath + '/' + targetName  // 构建新的分组路径

      onUpdateSessions(savedSessions.map(s =>
        s.group === oldPath ? { ...s, group: newPath } :
        s.group?.startsWith(oldPath + '/') ? { ...s, group: newPath + s.group.slice(oldPath.length) } : s
      ))  // 更新会话列表，更新会话的 group 路径（包含子树）
      onUpdatePlaceholders?.(Array.from(new Set(groupPlaceholders.map(g =>
        g === oldPath ? newPath :
        g.startsWith(oldPath + '/') ? newPath + g.slice(oldPath.length) : g
      ))))  // 更新占位分组（用于下次新增分组时自动补全）
    }
    dragRef.current = null
  }

  /**
   * 拖拽到会话
   * @param {Event} e 事件
   * @param {string} sessId 目标会话 ID
   * @param {string} groupPath 目标会话所属分组路径
   */
  const dropOnSession = (e, sessId, groupPath) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(null)
    const src = dragRef.current; if (!src || src.type !== 'session' || src.id === sessId) return  // 如果源对象不是会话，或者源对象 ID 与目标会话 ID 相同，则不处理
    const arr = savedSessions.slice()  // 获取会话列表副本
    const fi = arr.findIndex(s => s.savedId === src.id)  // 获取源会话在会话列表中的索引
    const ti = arr.findIndex(s => s.savedId === sessId)  // 获取目标会话在会话列表中的索引
    if (fi < 0 || ti < 0) return  // 防御性检查，索引异常就退出
    const [item] = arr.splice(fi, 1)  // 从原位置移除被拖拽会话，拿到 item
    const movedItem = { ...item, group: groupPath }  // 准备移动后的会话对象：分组改成目标分组
    const siblings = arr.filter(s => (s.group || '') === groupPath)  // 获取目标分组下的所有会话
    const used = new Set(siblings.map(s => s.label))
    if (used.has(movedItem.label)) {  // 如果目标分组下有同名会话，则自动重命名
      let i = 1
      while (used.has(`${movedItem.label}(${i})`)) i++
      movedItem.label = `${movedItem.label}(${i})`  // 自动添加后缀
    }
    arr.splice(ti, 0, movedItem)  // 将移动后的会话插入到目标位置
    const v = vacatedNamedGroupIfEmpty(item.group, arr)  // 检查是否需要恢复为占位分组
    onUpdateSessions(arr, v ? { placeholderForVacatedGroup: v } : undefined)  // 更新会话列表，如果需要恢复为占位分组，则设置占位分组
    dragRef.current = null
  }

  /**
   * 拖拽到无分组（根分组）区域
   * @param {Event} e 事件
   */
  const dropUngroup = (e) => {
    e.preventDefault(); setDragOver(null)
    const src = dragRef.current
    if (!src) return
    if (src.type === 'session') {  // 拖的是会话
      const movedSession = savedSessions.find(s => s.savedId === src.id)  // 找源会话对象；找不到就退出并清理状态
      if (!movedSession) { dragRef.current = null; return }
      const interim = savedSessions.map(s => s.savedId === src.id ? { ...s, group: '' } : s)  // 构造一个临时会话列表，把源会话的 group 设置为空
      const newLabel = uniqueLabelInGroup(interim, '', movedSession.label, src.id)
      const next = savedSessions.map(s => s.savedId === src.id ? { ...s, group: '', label: newLabel } : s)
      const v = vacatedNamedGroupIfEmpty(movedSession.group, next)
      onUpdateSessions(next, v ? { placeholderForVacatedGroup: v } : undefined)  // 更新会话列表，如果需要恢复为占位分组，则设置占位分组
    } else if (src.type === 'group') {  // 拖的是分组
      const oldPath = src.id
      const preferredName = oldPath.split('/').pop()  // 获取源分组名称
      const targetName = uniqueGroupNameUnder('', preferredName, oldPath)  // 确保目标分组名称在父分组下唯一
      const newPath = targetName  // 构建新的分组路径
      onUpdateSessions(savedSessions.map(s =>
        s.group === oldPath ? { ...s, group: newPath } :
        s.group?.startsWith(oldPath + '/') ? { ...s, group: newPath + s.group.slice(oldPath.length) } : s
      ))  // 更新会话列表，更新会话的 group 路径（包含子树）
      onUpdatePlaceholders?.(Array.from(new Set(groupPlaceholders.map(g =>
        g === oldPath ? newPath :
        g.startsWith(oldPath + '/') ? newPath + g.slice(oldPath.length) : g
      ))))  // 对占位分组做同样的路径迁移
    }
    dragRef.current = null
  }

  /** 搜索查询的 trimmed 版本 */
  const searchTrim = sessionSearchQuery.trim()
  /** 搜索查询的 lowercased 版本 */
  const searchLower = searchTrim.toLowerCase()
  /** 按保存的会话名（及主机）筛选侧边栏列表。 useMemo：记忆化计算，缓存结果，避免重复计算。当savedSessions/searchLower变化时重新计算 */
  const filteredSavedSessions = useMemo(() => {  // useMemo：记忆化计算，缓存结果，避免重复计算。当savedSessions/searchLower变化时重新计算
    if (!searchLower) return savedSessions
    return savedSessions.filter((s) => {
      const label = (s.label || '').toLowerCase()
      const host = (s.host || '').toLowerCase()
      const serialPath = (s.path || '').toLowerCase()
      return label.includes(searchLower) || host.includes(searchLower) || serialPath.includes(searchLower)
    })
  }, [savedSessions, searchLower])

  /** 搜索时 buildTree 不注入占位分组，避免无匹配会话下出现空分组树 */
  const treePlaceholders = searchTrim ? NO_GROUP_PLACEHOLDERS : groupPlaceholders

  /** 构建会话树结构，支持分组和未分组会话 */
  const tree = useMemo(
    () => buildTree(filteredSavedSessions, treePlaceholders),
    [filteredSavedSessions, treePlaceholders],
  )

  useEffect(() => {  // 有筛选关键词时自动展开匹配会话所在分组
    if (!searchTrim) return
    const paths = new Set()
    for (const s of filteredSavedSessions) {
      if (!s.group) continue
      let acc = ''
      for (const seg of s.group.split('/')) {
        acc = acc ? `${acc}/${seg}` : seg
        paths.add(acc)
      }
    }
    if (paths.size === 0) return
    setExpanded((prev) => {
      const next = { ...prev }
      for (const p of paths) next[p] = true
      return next
    })
  }, [searchTrim, filteredSavedSessions])

  /** 是否有 SFTP 面板。 !!(...) 把结果强制转换成布尔值 */
  const hasSftp = !!activeSession?.sftpReady

  return (
    <div className={`sidebar ${open ? 'open' : 'closed'}`} style={open ? style : undefined} onClick={closeCtx}>
      <input ref={importSessionsFileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportSessionsFile} aria-hidden />
      <SidebarTop open={open} onToggle={onToggle} onOpenSettings={onOpenSettings} t={t} />
      {open && (
        <div className="sidebar-content">
          {hasSftp && (
            <div className="sidebar-sftp-section">
              <div className="sb-section-row" onClick={() => setSftpExpanded(v => !v)}>
                <span className={`sb-chevron${sftpExpanded ? ' open' : ''}`}><Chevron /></span>
                <span className="sftp-item-icon">📁</span>
                <span className="sb-section-label">{t('sidebar.remoteFiles')}</span>
              </div>
              {sftpExpanded && <SftpPanel session={activeSession} />}
            </div>
          )}
          <div className="sb-sessions-scroll">
            <div className={`sb-section-row sessions-header${isDO('__sessions_header__', 'drop') ? ' drop-target' : ''}`}
              onClick={() => setSessionsCollapsed(v => !v)}
              onContextMenu={e => openCtx(e, 'sessions-header', null)}
              onDragOver={e => dOver(e, '__sessions_header__', 'drop')}
              onDragLeave={dLeave}
              onDrop={dropUngroup}>
              <span className={`sb-chevron${sessionsCollapsed ? '' : ' open'}`}><Chevron /></span>
              <span className="sftp-item-icon sb-folder-icon" style={{ color: !sessionsCollapsed ? '#e8bf6a' : '#c4a35a' }}><FolderIcon open={open} /></span>
              <span className="sb-section-label">{t('sidebar.savedSessions')}</span>
            </div>
            {!sessionsCollapsed && (
              <>
                <div className="sb-session-search-wrap">
                  <input
                    type="search"
                    className="sb-session-search"
                    placeholder={t('sidebar.searchPh')}
                    value={sessionSearchQuery}
                    onChange={(e) => setSessionSearchQuery(e.target.value)}
                    aria-label={t('sidebar.searchAria')}
                  />
                </div>
                <div
                  className={`sb-tree${isDO('__root__', 'drop') ? ' drop-target' : ''}`}
                  onDragOver={e => dOver(e, '__root__', 'drop')}
                  onDragLeave={dLeave}
                  onDrop={dropUngroup}>
                {tree.length === 0 && (
                  <div className="sb-empty">
                    {savedSessions.length === 0 ? (
                      <>
                        <span>{t('sidebar.noSaved')}</span>
                        <button type="button" className="sb-link" onClick={() => onNewSession('ssh')}>{t('sidebar.newConnection')}</button>
                        <button type="button" className="sb-link" onClick={() => importSessionsFileRef.current?.click()}>{t('settings.importSessions')}</button>
                      </>
                    ) : searchTrim ? (
                      <>
                        <span>{t('sidebar.noMatch')}</span>
                        <button type="button" className="sb-link" onClick={() => setSessionSearchQuery('')}>{t('sidebar.clearSearch')}</button>
                      </>
                    ) : (
                      <span>{t('sidebar.nothingToShow')}</span>
                    )}
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
              </>
            )}
          </div>
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
          savedSessions={savedSessions}
          importSessionsFileRef={importSessionsFileRef}
        />
      )}
    </div>
  )
}

/**
 * 树节点组件：显示分组或会话的树节点，支持重命名、拖拽、上下文菜单等操作
 * @param {object} props 组件属性
 * @param {object} props.node 节点对象：包含 id、type、name、path 和 children 属性
 * @param {number} props.depth 节点深度：节点所在的层级
 * @param {function} props.isExp 是否展开的回调函数：点击展开时调用，参数是路径
 * @param {function} props.togExp 切换展开状态的回调函数：点击展开时调用，参数是路径
 * @param {function} props.openCtx 打开上下文菜单的回调函数：点击上下文菜单时调用，参数是事件和路径
 * @param {function} props.onConnectSaved 连接会话的回调函数：点击连接会话时调用，参数是会话对象
 * @param {function} props.renaming 重命名状态：包含路径和新的名称
 * @param {function} props.renameVal 重命名值：新的名称
 * @param {function} props.setRenameVal 设置重命名值的回调函数：点击重命名时调用，参数是新的名称
 * @param {function} props.setRenaming 设置重命名状态的回调函数：点击重命名时调用，参数是路径和新的名称
 * @param {function} props.renameGroup 重命名分组的回调函数：点击重命名时调用，参数是路径和新的名称
 * @param {function} props.renameGroupInputRef 重命名分组输入引用
 * @param {function} props.ignoreRenameGroupBlurRef 重命名分组忽略 blur 引用（blur 事件也就是失去焦点事件）
 * @param {function} props.renamingSession 重命名会话状态：包含 savedId 和新的名称
 * @param {function} props.renameSessionVal 重命名会话值：新的名称
 * @param {function} props.setRenamingSession 设置重命名会话状态的回调函数：点击重命名会话时调用，参数是会话 ID 和新的名称
 * @param {function} props.setRenameSessionVal 设置重命名会话值的回调函数：点击重命名会话时调用，参数是新的名称
 * @param {function} props.renameSession 重命名会话的回调函数：点击重命名会话时调用，参数是会话 ID 和新的名称
 * @param {function} props.renameSessionInputRef 重命名会话输入引用
 * @param {function} props.ignoreRenameSessionBlurRef 重命名会话忽略 blur 引用（blur 事件也就是失去焦点事件）
 * @param {function} props.dStart 拖拽开始事件处理函数：点击拖拽时调用，参数是事件和路径
 * @param {function} props.dEnd 拖拽结束事件处理函数：点击拖拽时调用，参数是事件和路径
 * @param {function} props.dOver 拖拽覆盖事件处理函数：点击拖拽时调用，参数是事件和路径
 * @param {function} props.dLeave 拖拽离开事件处理函数：点击拖拽时调用，参数是事件和路径
 * @param {function} props.dropOnGroup 拖拽到分组的回调函数：点击拖拽时调用，参数是事件和路径
 * @param {function} props.dropOnSession 拖拽到会话的回调函数：点击拖拽时调用，参数是事件和路径
 * @param {function} props.isDO 是否是拖拽目标的回调函数：点击拖拽时调用，参数是路径和类型
 * @returns {JSX.Element} 树节点组件
 */
function TreeNode({ node, depth, isExp, togExp, openCtx, onConnectSaved,
  renaming, renameVal, setRenameVal, setRenaming, renameGroup,
  renameGroupInputRef, ignoreRenameGroupBlurRef,
  renamingSession, renameSessionVal, setRenamingSession, setRenameSessionVal, renameSession, renameSessionInputRef,
  ignoreRenameSessionBlurRef,
  dStart, dEnd, dOver, dLeave, dropOnGroup, dropOnSession, isDO }) {
  const indent = depth * 14 + 14
  if (node.type === 'group') {
    const open = isExp(node.path)  // 是否展开
    const isDropTarget = isDO(node.id, 'group')  // 是否是拖拽目标
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
      <span className="sb-session-icon" style={{ color: TYPE_COLORS[s.type] }}>{ConnectionTypeIcon[s.type]}</span>
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
function SidebarTop({ open, onToggle, onOpenSettings, t }) {
  return (
    <div className="sidebar-top">
      <button type="button" className="sidebar-toggle" onClick={onToggle} title={open ? t('sidebar.collapse') : t('sidebar.expand')}>
        <svg width="18" height="18" viewBox="0 0 16 16">
          {open
            ? <path d="M6 2L2 8L6 14M10 2L6 8L10 14" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
            : <path d="M10 2L14 8L10 14M6 2L10 8L6 14" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>}
        </svg>
      </button>
      {open && <button type="button" className="sidebar-settings-btn" title={t('sidebar.settings')} onClick={onOpenSettings}>⚙</button>}
    </div>
  )
}

/**
 * 上下文菜单组件：显示会话、分组、子分组、新分组等操作的上下文菜单
 * @param {object} props 组件属性
 * @param {object} props.ctx 上下文菜单数据：包含 x、y 坐标、类型和数据
 * @param {function} props.closeCtx 关闭上下文菜单的回调函数
 * @param {function} props.onConnectSaved 连接会话的回调函数：点击连接会话时调用，参数是会话对象
 * @param {function} props.onNewSession 新建会话的回调函数：点击新建会话时调用，参数是会话类型和会话对象
 * @param {function} props.dupSession 复制会话的回调函数：点击复制会话时调用，参数是会话 ID
 * @param {function} props.deleteSession 删除会话的回调函数：点击删除会话时调用，参数是会话 ID 和会话名称
 * @param {function} props.deleteGroup 删除分组的回调函数：点击删除分组时调用，参数是分组路径
 * @param {function} props.setRenaming 设置重命名状态的回调函数：点击重命名时调用，参数是路径和新的名称
 * @param {function} props.setRenameVal 设置重命名值的回调函数：点击重命名时调用，参数是新的名称
 * @param {array} props.groupPlaceholders 占位分组列表：包含分组路径
 * @param {function} props.onUpdatePlaceholders 更新占位分组的回调函数：点击更新占位分组时调用，参数是分组路径
 * @param {function} props.expandAll 展开所有分组的回调函数：点击展开所有时调用
 * @param {function} props.collapseAll 收起所有分组的回调函数：点击收起所有时调用
 * @param {function} props.expandGroupAll 展开该分组所有子项的回调函数：点击展开该分组所有子项时调用，参数是分组路径
 * @param {function} props.collapseGroupAll 收起该分组所有子项的回调函数：点击收起该分组所有子项时调用，参数是分组路径
 * @param {function} props.setRenamingSession 设置重命名会话状态的回调函数：点击重命名会话时调用，参数是会话 ID 和新的名称
 * @param {function} props.setRenameSessionVal 设置重命名会话值的回调函数：点击重命名会话时调用，参数是新的名称
 * @param {array} props.savedSessions 已保存会话（用于导出）
 * @param {import('react').MutableRefObject<HTMLInputElement|null>} props.importSessionsFileRef 隐藏的文件选择 input
 * @returns {JSX.Element} 上下文菜单组件
 */
function CtxMenu({ ctx, closeCtx, onConnectSaved, onNewSession, dupSession, deleteSession, deleteGroup, setRenaming, setRenameVal, groupPlaceholders, onUpdatePlaceholders, expandAll, collapseAll, expandGroupAll, collapseGroupAll, setRenamingSession, setRenameSessionVal, savedSessions, importSessionsFileRef }) {
  const { t } = useI18n()
  const [subInput, setSubInput] = useState(null)  // 子分组名称输入值
  const [newGroupInput, setNewGroupInput] = useState(null)  // 新分组名称输入值
  const subInputRef = useRef(null)  // 子分组名称输入引用
  const newGroupInputRef = useRef(null)  // 新分组名称输入引用
  const menuRef = useRef(null)  // 上下文菜单引用
  const [menuPos, setMenuPos] = useState({ x: ctx.x, y: ctx.y })  // 上下文菜单位置

  useLayoutEffect(() => {  // 根据视口边界动态修正菜单位置，避免底部/右侧被遮挡
    const menuEl = menuRef.current
    if (!menuEl) return
    const margin = 8
    const maxX = Math.max(margin, window.innerWidth - menuEl.offsetWidth - margin)
    const maxY = Math.max(margin, window.innerHeight - menuEl.offsetHeight - margin)
    const nextX = Math.max(margin, Math.min(ctx.x, maxX))
    const nextY = Math.max(margin, Math.min(ctx.y, maxY))
    setMenuPos((prev) => (prev.x === nextX && prev.y === nextY ? prev : { x: nextX, y: nextY }))
  }, [ctx.x, ctx.y, subInput, newGroupInput])

  const renderInBody = (node) => {  // 把侧边栏右键菜单改成 Portal 渲染到 document.body，不再受 sb-sessions-scroll 或侧边栏容器裁剪影响可视范围
    if (!document?.body) return null
    return createPortal(node, document.body)
  }

  if (subInput !== null) {
    return renderInBody(
      <div ref={menuRef} className="context-menu context-menu-input" style={{ top: menuPos.y, left: menuPos.x }} onClick={e => e.stopPropagation()}>
        <div className="context-menu-input-label">{t('sidebar.subGroupName')}</div>
        <input className="context-menu-input-field" value={subInput} autoFocus placeholder={t('sidebar.namePh')} ref={subInputRef}
          onChange={e => setSubInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const trimmed = subInput.trim()
              if (!trimmed) { alert(t('sidebar.groupNameEmpty')); return }
              if (INVALID_LABEL_CHARS.test(trimmed)) { alert(t('sidebar.groupNameInvalid')); return }
              onUpdatePlaceholders?.(addGroupPlaceholder(groupPlaceholders, `${ctx.data}/${trimmed}`))
              setSubInput(null); closeCtx()
            }
            if (e.key === 'Escape') { setSubInput(null); closeCtx() }
          }} />
        <div className="context-menu-input-actions">
          <button type="button" onClick={() => { setSubInput(null); closeCtx() }}>{t('sidebar.cancel')}</button>
          <button type="button" className="confirm" onClick={() => {
            const trimmed = subInput.trim()
            if (!trimmed) { alert(t('sidebar.groupNameEmpty')); subInputRef.current?.focus(); return }
            if (INVALID_LABEL_CHARS.test(trimmed)) { alert(t('sidebar.groupNameInvalid')); subInputRef.current?.focus(); return }
            onUpdatePlaceholders?.(addGroupPlaceholder(groupPlaceholders, `${ctx.data}/${trimmed}`))
            setSubInput(null); closeCtx()
          }}>{t('sidebar.confirm')}</button>
        </div>
      </div>
    )
  }

  if (newGroupInput !== null) {
    return renderInBody(
      <div ref={menuRef} className="context-menu context-menu-input" style={{ top: menuPos.y, left: menuPos.x }} onClick={e => e.stopPropagation()}>
        <div className="context-menu-input-label">{t('sidebar.groupName')}</div>
        <input className="context-menu-input-field" value={newGroupInput} autoFocus placeholder={t('sidebar.namePh')} ref={newGroupInputRef}
          onChange={e => setNewGroupInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const trimmed = newGroupInput.trim()
              if (!trimmed) { alert(t('sidebar.groupNameEmpty')); return }
              if (INVALID_LABEL_CHARS.test(trimmed)) { alert(t('sidebar.groupNameInvalid')); return }
              onUpdatePlaceholders?.(addGroupPlaceholder(groupPlaceholders, trimmed))
              setNewGroupInput(null); closeCtx()
            }
            if (e.key === 'Escape') { setNewGroupInput(null); closeCtx() }
          }} />
        <div className="context-menu-input-actions">
          <button type="button" onClick={() => { setNewGroupInput(null); closeCtx() }}>{t('sidebar.cancel')}</button>
          <button type="button" className="confirm" onClick={() => {
            const trimmed = newGroupInput.trim()
            if (!trimmed) { alert(t('sidebar.groupNameEmpty')); newGroupInputRef.current?.focus(); return }
            if (INVALID_LABEL_CHARS.test(trimmed)) { alert(t('sidebar.groupNameInvalid')); newGroupInputRef.current?.focus(); return }
            onUpdatePlaceholders?.(addGroupPlaceholder(groupPlaceholders, trimmed))
            setNewGroupInput(null); closeCtx()
          }}>{t('sidebar.confirm')}</button>
        </div>
      </div>
    )
  }
  return renderInBody(
    <div ref={menuRef} className="context-menu" style={{ top: menuPos.y, left: menuPos.x }} onClick={e => e.stopPropagation()}>
      {ctx.type === 'sessions-header' && (<>
        <button type="button" onClick={() => { onNewSession('ssh'); closeCtx() }}>{t('sidebar.newConnectionMenu')}</button>
        <button type="button" onClick={() => setNewGroupInput('')}>{t('sidebar.newGroup')}</button>
        <div className="context-menu-divider" />
        <button type="button" onClick={() => { expandAll(); closeCtx() }}>{t('sidebar.expandAll')}</button>
        <button type="button" onClick={() => { collapseAll(); closeCtx() }}>{t('sidebar.collapseAll')}</button>
        <div className="context-menu-divider" />
        <button type="button" onClick={() => { exportSessions(savedSessions); closeCtx() }}>{t('settings.exportSessions')}</button>
        <button type="button" onClick={() => {
          closeCtx()
          queueMicrotask(() => importSessionsFileRef.current?.click())
        }}>{t('settings.importSessions')}</button>
      </>)}
      {ctx.type === 'session' && (<>
        <button type="button" onClick={() => { onConnectSaved(ctx.data); closeCtx() }}>{t('sidebar.connect')}</button>
        <button type="button" onClick={() => { onNewSession(ctx.data.type, ctx.data); closeCtx() }}>{t('sidebar.edit')}</button>
        <button type="button" onClick={() => { setRenamingSession(ctx.data.savedId); setRenameSessionVal(ctx.data.label || ''); closeCtx() }}>{t('sidebar.rename')}</button>
        <button type="button" onClick={() => { dupSession(ctx.data.savedId); closeCtx() }}>{t('sidebar.duplicate')}</button>
        <button type="button" className="danger" onClick={() => { deleteSession(ctx.data.savedId, ctx.data.label); closeCtx() }}>{t('sidebar.delete')}</button>
      </>)}
      {ctx.type === 'group' && (<>
        <button type="button" onClick={() => { onNewSession('ssh', { group: ctx.data }); closeCtx() }}>{t('sidebar.newSession')}</button>
        <button type="button" onClick={() => { setRenaming(ctx.data); setRenameVal(ctx.data.split('/').pop()); closeCtx() }}>{t('sidebar.renameGroup')}</button>
        <button type="button" onClick={() => setSubInput('')}>{t('sidebar.newSubGroup')}</button>
        <div className="context-menu-divider" />
        <button type="button" onClick={() => { expandGroupAll(ctx.data); closeCtx() }}>{t('sidebar.expandGroup')}</button>
        <button type="button" onClick={() => { collapseGroupAll(ctx.data); closeCtx() }}>{t('sidebar.collapseGroup')}</button>
        <div className="context-menu-divider" />
        <button type="button" className="danger" onClick={() => { deleteGroup(ctx.data); closeCtx() }}>{t('sidebar.deleteGroup')}</button>
      </>)}
    </div>
  )
}
