import { useState, useCallback } from 'react'

let _setState = null
let _state = {
  sessions: [],
  activeSessionId: null,
  sidebarOpen: true,
  sftpPanelOpen: false,
}

export function useSessionStore() {
  const [state, setState] = useState(_state)
  _setState = (updater) => {
    setState(prev => {
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
