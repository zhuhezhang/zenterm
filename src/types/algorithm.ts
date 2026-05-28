import type { AlgorithmPreferences } from '../../shared/sshAlgorithmDefaults'

/** SSH 算法偏好中的类别键（kex / cipher 等） */
export type AlgorithmCategory = keyof AlgorithmPreferences
