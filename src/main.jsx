import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/global.css'

/**  React 错误边界组件，用于捕获子组件渲染过程中发生的错误，并显示友好的错误信息界面 */
class ErrorBoundary extends React.Component {
  /** 构造函数：初始化状态，error 用于存储捕获到的错误信息 */
  constructor(props) { super(props); this.state = { error: null } }

  /** React 生命周期方法：当子组件抛出错误时调用，接收错误对象作为参数，更新状态以触发重新渲染显示错误界面*/
  static getDerivedStateFromError(e) { return { error: e } }

  /** 可选的生命周期方法：当组件捕获到错误时调用，可以在这里执行日志记录等副作用操作 */
  componentDidCatch(e, info) { console.error('App crashed:', e, info) }

  /** 渲染方法：如果状态中有错误信息，显示错误界面；否则正常渲染子组件 */
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: '#f85149', fontFamily: 'monospace', background: '#0d1117', minHeight: '100vh' }}>
          <h2>❌ App Render Error</h2>
          <pre style={{ marginTop: 16, whiteSpace: 'pre-wrap', color: '#e6edf3' }}>
            {this.state.error?.stack || String(this.state.error)}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
