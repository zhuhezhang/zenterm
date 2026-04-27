import { useState, useEffect } from 'react'
import '../styles/titlebar.css'

const IS_MAC = navigator.userAgent.includes('Mac OS X') &&
  !navigator.userAgent.includes('Windows') &&
  !navigator.userAgent.includes('Linux')

/**
 * 标题栏组件，包含窗口控制按钮和应用标题
 * 通过 useState 管理窗口最大化状态，useEffect 订阅 Electron 窗口事件并初始化状态
 * 根据平台条件渲染窗口控制按钮（MacOS 不显示）
 */
export default function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  // 需要 useEffect，因为这段逻辑是：
  // 与 UI 渲染无关的副作用；需要在组件挂载后执行；应该只执行一次，而不是每次 render 都执行；访问外部系统（Electron IPC）来订阅事件和获取初始状态
  useEffect(() => {
    window.zterm?.window.onMaximized((v) => setMaximized(v))  // 订阅 Electron 窗口最大化/还原事件。当窗口状态改变时，回调会把最新状态写入 maximized
    window.zterm?.window.isMaximized().then(setMaximized)  // 获取窗口当前最大化状态，并初始化 maximized 状态。由于 isMaximized 是一个异步函数（返回 Promise），因此使用 .then 来处理结果并更新状态
  }, [])

  return (
    <div className={`titlebar ${IS_MAC ? 'is-mac' : 'is-not-mac'}`}>
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
