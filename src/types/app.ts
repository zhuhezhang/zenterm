import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { AppSettings } from './settings'

/** 应用主组件的属性 */
export interface AppMainProps {
  /** 设置 */
  settings: AppSettings
  /** 设置回调函数 */
  setSettings: Dispatch<SetStateAction<AppSettings>>
}

/** 错误边界组件的属性 */
export interface ErrorBoundaryProps {
  /** 子组件 */
  children: ReactNode
}

/** 错误边界组件的状态 */
export interface ErrorBoundaryState {
  /** 错误 */
  error: Error | null
}
