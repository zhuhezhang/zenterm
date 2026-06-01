import { useState, useRef, useCallback, useEffect, type FocusEvent, type MouseEvent } from 'react'
import type { SettingsHoverTip } from '@/types/settingsUi'

export function useSettingsHoverTip() {
  const [settingsHoverTip, setSettingsHoverTip] = useState<SettingsHoverTip | null>(null)
  const timerRef = useRef<number | null>(null)

  const hideSettingsHoverTip = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setSettingsHoverTip(null)
  }, [])

  const showSettingsHoverTip = useCallback((e: MouseEvent | FocusEvent, text: string) => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const r = e.currentTarget.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      setSettingsHoverTip({ text, x, y })
    }, 1000)
  }, [])

  useEffect(() => {
    document.addEventListener('pointerdown', hideSettingsHoverTip, true)
    document.addEventListener('click', hideSettingsHoverTip, true)
    return () => {
      document.removeEventListener('pointerdown', hideSettingsHoverTip, true)
      document.removeEventListener('click', hideSettingsHoverTip, true)
      if (timerRef.current != null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [hideSettingsHoverTip])

  return { settingsHoverTip, showSettingsHoverTip, hideSettingsHoverTip }
}
