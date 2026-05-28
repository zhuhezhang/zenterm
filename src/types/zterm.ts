/** 渲染进程：re-export shared 契约，并声明 window.zterm */
export type * from '../../shared/zterm-api'

import type { ZTermApi } from '../../shared/zterm-api'

declare global {
  interface Window {
    zterm?: ZTermApi
  }
}

export {}
