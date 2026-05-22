import { useCallback } from 'react'
import { clampSidebarWidthPx } from '@/lib/settings/normalize.js'
import { saveSettings } from '@/store/settingsStore.js'

/**
 * 侧边栏分割线拖拽：记录起始位置，监听 mousemove 更新宽度，mouseup 时写回 settings
 * @param {number} sidebarWidth 当前侧边栏宽度
 * @param {function} setSidebarWidth 更新宽度的 setState
 * @param {function} setSettings 更新 settings 的 setState
 * @returns {function} mousedown 事件处理函数（useCallback：把函数做成稳定的、可重用的函数引用）
 */
export function useSidebarResize(sidebarWidth, setSidebarWidth, setSettings) {
  return useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = sidebarWidth
    let latest = startW
    /** 鼠标移动时更新侧边栏宽度 */
    const onMove = (ev) => {
      latest = clampSidebarWidthPx(startW + ev.clientX - startX, window.innerWidth)
      setSidebarWidth(latest)
    }
    /** 鼠标释放时移除监听器，并保存设置 */
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setSettings((prev) => {
        const next = { ...prev, sidebarWidth: latest }
        saveSettings(next)
        return next
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [sidebarWidth, setSettings, setSidebarWidth])
}
