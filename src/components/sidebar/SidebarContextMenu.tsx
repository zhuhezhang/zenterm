import { useState, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/context/I18nContext'
import { addGroupPlaceholder, exportSessions } from '@/store/sessionStore'
import { hasInvalidLabelChars } from '../../lib/safeFileName'

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
export default function SidebarContextMenu({
  ctx, closeCtx, onConnectSaved, onNewSession, dupSession, deleteSession, deleteGroup,
  setRenaming, setRenameVal, groupPlaceholders, onUpdatePlaceholders,
  expandAll, collapseAll, expandGroupAll, collapseGroupAll,
  setRenamingSession, setRenameSessionVal, savedSessions, importSessionsFileRef,
}) {
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
              if (hasInvalidLabelChars(trimmed)) { alert(t('sidebar.groupNameInvalid')); return }
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
            if (hasInvalidLabelChars(trimmed)) { alert(t('sidebar.groupNameInvalid')); subInputRef.current?.focus(); return }
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
              if (hasInvalidLabelChars(trimmed)) { alert(t('sidebar.groupNameInvalid')); return }
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
            if (hasInvalidLabelChars(trimmed)) { alert(t('sidebar.groupNameInvalid')); newGroupInputRef.current?.focus(); return }
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
        <button type="button" onClick={() => { void exportSessions(savedSessions, t); closeCtx() }}>{t('settings.exportSessions')}</button>
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
