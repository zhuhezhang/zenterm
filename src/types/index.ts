/**
 * 渲染进程领域类型聚合入口（仅 src/ 内 UI、状态、组件 props）。
 *
 * 跨进程契约请直接引用 shared/：
 * - IPC 响应：shared/ipc.ts
 * - window.zterm API：shared/zterm-api.d.ts
 * - SSH 算法默认值：shared/sshAlgorithmDefaults.ts（类别键见 src/lib/settings/algorithmCategory.ts）
 *
 * 全局环境扩展（无需 import）：global.d.ts、vite-env.d.ts、zterm.ts
 */

export type * from './app'
export type * from './components'
export type * from './connectDialog'
export type * from './credentials'
export type * from './errors'
export type * from './i18n'
export type * from './import'
export type * from './session'
export type * from './settings'
export type * from './settingsUi'
export type * from './sftp'
export type * from './tabBar'
export type * from './terminal'
