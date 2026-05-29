import type { AlgorithmPreferences } from '../../../shared/sshAlgorithmDefaults'

/** SSH 算法偏好中的类别键（kex / cipher 等），与设置 UI 及 ssh2 algorithms 字段一致 */
export type AlgorithmCategory = keyof AlgorithmPreferences
