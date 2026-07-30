import type { ZenTermApi } from '../../../shared/zenterm-api'

/**
 * 渲染进程内获取 preload 暴露的 bridge；不可用时抛错供调用方 catch
 * @returns ZenTermApi
 */
export function getZenterm(): ZenTermApi {
  const api = window.zenterm
  if (!api) {
    throw new Error('window.zenterm is not available')
  }
  return api
}
