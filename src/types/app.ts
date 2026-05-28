import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { AppSettings } from './settings'

/** 应用主组件的属性 */
export interface AppMainProps {
  settings: AppSettings
  setSettings: Dispatch<SetStateAction<AppSettings>>
}

/** 错误边界组件的属性 */
export interface ErrorBoundaryProps {
  children: ReactNode
}

/** 错误边界组件的状态 */
export interface ErrorBoundaryState {
  error: Error | null
}
