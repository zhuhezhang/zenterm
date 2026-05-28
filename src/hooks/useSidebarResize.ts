import { useCallback, type Dispatch, type MouseEvent, type SetStateAction } from 'react'
import { clampSidebarWidthPx } from '@/lib/settings/normalize'
import type { AppSettings } from '@/types/settings'
import { saveSettings } from '@/store/settingsStore'

export function useSidebarResize(
  sidebarWidth: number,
  setSidebarWidth: Dispatch<SetStateAction<number>>,
  setSettings: Dispatch<SetStateAction<AppSettings>>,
) {
  return useCallback((e: MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = sidebarWidth
    let latest = startW
    const onMove = (ev: globalThis.MouseEvent) => {
      latest = clampSidebarWidthPx(startW + ev.clientX - startX, window.innerWidth)
      setSidebarWidth(latest)
    }
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
