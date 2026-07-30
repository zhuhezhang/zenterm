/** 渲染进程：将 shared/zenterm-api 挂到 window.zenterm（须保留 import，故用 .ts 而非纯 .d.ts） */
import type { ZenTermApi } from '../../shared/zenterm-api'

declare global {
  interface Window {
    zenterm?: ZenTermApi
  }
}

export {}
