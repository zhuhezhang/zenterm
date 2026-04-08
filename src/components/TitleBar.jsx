import React, { useState, useEffect } from 'react'
import '../styles/titlebar.css'

const IS_MAC = navigator.userAgent.includes('Mac OS X') &&
  !navigator.userAgent.includes('Windows') &&
  !navigator.userAgent.includes('Linux')

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.zterm?.window.onMaximized((v) => setMaximized(v))
    window.zterm?.window.isMaximized().then(setMaximized)
  }, [])

  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <div className="titlebar-logo">⚡ ZTerm</div>
      </div>
      {!IS_MAC && (
        <div className="titlebar-controls">
          <button className="titlebar-btn minimize" onClick={() => window.zterm?.window.minimize()} title="最小化">
            <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
          </button>
          <button className="titlebar-btn maximize" onClick={() => window.zterm?.window.maximize()} title={maximized ? '还原' : '最大化'}>
            {maximized
              ? <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 0H10V8H8V10H0V2H2V0ZM3 1V3H1V9H7V7H9V1H3Z" fill="currentColor"/></svg>
              : <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0" y="0" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
            }
          </button>
          <button className="titlebar-btn close" onClick={() => window.zterm?.window.close()} title="关闭">
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
      )}
    </div>
  )
}
