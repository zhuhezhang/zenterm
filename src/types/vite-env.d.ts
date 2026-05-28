/// <reference types="vite/client" />

import 'react'

declare module 'react' {
  /** 在 React 的 InputHTMLAttributes 上 合并 两个可选属性。所以 SftpPanel.tsx 里可以写：
   *  <input webkitdirectory="" />，否则 strict 模式下可能报“属性不存在”
   */
  interface InputHTMLAttributes<T> {
    webkitdirectory?: string
    directory?: string
  }
}
