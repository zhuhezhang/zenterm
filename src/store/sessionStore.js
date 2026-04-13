import { useState, useCallback } from 'react'

let _setState = null  // 用于从外部统一更新状态（下划线开头只是一个命名习惯，含义是：这个变量是“内部使用的”，只是开发者约定上的“私有”标记）
let _state = {  // 仅用于初始化并保持“跨组件”的最新状态快照
  sessions: [],
  activeSessionId: null,
  sidebarOpen: true,
  sftpPanelOpen: false,
}

/** 
 * 自定义 React Hook，用于管理会话状态，包括会话列表、当前激活的会话 ID、侧边栏和 SFTP 面板的开关状态等
 * 提供了一系列操作函数（addSession、removeSession、updateSession、setActiveSession、toggleSidebar、toggleSftpPanel）来修改状态，并确保组件重新渲染以反映最新状态
 * 通过 useState 管理状态，useCallback 优化函数引用，避免不必要的重新渲染
 * 
 * @returns {Object} 包含当前状态和操作函数的对象，供组件使用
 */
export function useSessionStore() {
  const [state, setState] = useState(_state)

  /** 
   * 更新状态的函数，用于从外部统一更新状态
   * 
   * @param {Function|Object} updater - 更新函数或更新对象
   */
  _setState = (updater) => {
    setState(prev => {  // 如果 updater 是函数，则调用它并传入当前状态 prev，得到新的状态对象 next；如果 updater 是对象，则直接将其与当前状态合并得到 next。调用 React 的 setState 来更新状态，React 组件会重新渲染
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
      _state = next
      return next
    })
  }

  const addSession = useCallback((session) => {
    _setState(prev => ({
      ...prev,
      sessions: [...prev.sessions, session],
      activeSessionId: session.id,
    }))
  }, [])

  const removeSession = useCallback((id) => {
    _setState(prev => {
      const sessions = prev.sessions.filter(s => s.id !== id)
      let activeSessionId = prev.activeSessionId
      if (activeSessionId === id) {
        const idx = prev.sessions.findIndex(s => s.id === id)
        activeSessionId = sessions[Math.max(0, idx - 1)]?.id || sessions[0]?.id || null
      }
      return { ...prev, sessions, activeSessionId }
    })
  }, [])

  const updateSession = useCallback((id, updates) => {
    _setState(prev => ({
      ...prev,
      sessions: prev.sessions.map(s => s.id === id ? { ...s, ...updates } : s),
    }))
  }, [])

  const setActiveSession = useCallback((id) => {
    _setState(prev => ({ ...prev, activeSessionId: id }))
  }, [])

  const toggleSidebar = useCallback(() => {
    _setState(prev => ({ ...prev, sidebarOpen: !prev.sidebarOpen }))
  }, [])

  const toggleSftpPanel = useCallback(() => {
    _setState(prev => ({ ...prev, sftpPanelOpen: !prev.sftpPanelOpen }))
  }, [])

  return {
    ...state,
    addSession,
    removeSession,
    updateSession,
    setActiveSession,
    toggleSidebar,
    toggleSftpPanel,
  }
}
