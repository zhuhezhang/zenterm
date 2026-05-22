import ConnectionTypeIcon from '../common.jsx'
import { Chevron, FolderIcon, TYPE_COLORS } from './icons.jsx'

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
 * @param {string|null} props.keyboardFocusId 搜索框键盘导航当前高亮的节点 id
 * @returns {JSX.Element} 树节点组件
 */
export default function SessionTreeNode({
  node, depth, keyboardFocusId, isExp, togExp, openCtx, onConnectSaved,
  renaming, renameVal, setRenameVal, setRenaming, renameGroup,
  renameGroupInputRef, ignoreRenameGroupBlurRef,
  renamingSession, renameSessionVal, setRenamingSession, setRenameSessionVal, renameSession, renameSessionInputRef,
  ignoreRenameSessionBlurRef,
  dStart, dEnd, dOver, dLeave, dropOnGroup, dropOnSession, isDO,
}) {
  const indent = depth * 14 + 14
  const isKbFocused = keyboardFocusId === node.id
  if (node.type === 'group') {
    const open = isExp(node.path)  // 是否展开
    const isDropTarget = isDO(node.id, 'group')  // 是否是拖拽目标
    return (
      <div className="sb-node-group">
        <div
          className={`sb-row sb-folder-row${isDropTarget ? ' drop-target' : ''}${isKbFocused ? ' sb-keyboard-focus' : ''}`}
          data-tree-id={node.id}
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
          <SessionTreeNode key={child.id} node={child} depth={depth + 1}
            keyboardFocusId={keyboardFocusId}
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
      className={`sb-row sb-session-row${isDropTarget ? ' drop-target' : ''}${isKbFocused ? ' sb-keyboard-focus' : ''}`}
      data-tree-id={node.id}
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
