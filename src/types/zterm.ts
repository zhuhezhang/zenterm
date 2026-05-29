/** 渲染进程：声明 window.zterm（类型定义见 shared/zterm-api.d.ts） */
import type { ZTermApi } from '../../shared/zterm-api'

declare global {
  interface Window {
    zterm?: ZTermApi
  }
}

export {}
