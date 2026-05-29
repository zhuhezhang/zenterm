import { useEffect } from 'react'

/**
 * 菜单/弹层打开时，点击外部区域关闭
 * @param open 是否打开
 * @param onClose 关闭回调
 * @param menuSelector 菜单根元素选择器（点击其内部不关闭）
 */
export function useDismissOnOutsideClick(
  open: boolean,
  onClose: () => void,
  menuSelector: string,
) {
  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (e: globalThis.MouseEvent) => {
      if ((e.target as Element | null)?.closest?.(menuSelector)) return
      onClose()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open, onClose, menuSelector])
}
