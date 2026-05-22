import { useState, useLayoutEffect } from 'react'
import { resolveEffectiveAppTheme } from '@/theme/appTheme.js'

/**
 * 同步应用主题到 document、原生窗口底色，并在 auto 时监听系统主题变化
 * @param {'dark'|'light'|'auto'} appTheme
 * @returns {'dark'|'light'} 当前实际亮暗
 */
export function useSyncedAppTheme(appTheme) {
  const [effective, setEffective] = useState(() => resolveEffectiveAppTheme(appTheme))

  useLayoutEffect(() => {
    const apply = () => {
      const eff = resolveEffectiveAppTheme(appTheme)
      setEffective(eff)
      const root = document.documentElement
      root.dataset.appTheme = eff  // 使 html 标签变成类似<html data-app-theme="light" lang="zh-CN">这样的形式，方便在 CSS 中使用 [data-app-theme="light"] 选择器
      root.style.colorScheme = eff
      window.zterm?.window?.setBackgroundColor?.(eff === 'light' ? '#ffffff' : '#0d1117')
    }
    apply()
    if (appTheme !== 'auto') return undefined
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [appTheme])

  return effective
}
