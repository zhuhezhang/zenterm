import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { AppSettings } from './settings'

export interface AppMainProps {
  settings: AppSettings
  setSettings: Dispatch<SetStateAction<AppSettings>>
}

export interface ErrorBoundaryProps {
  children: ReactNode
}

export interface ErrorBoundaryState {
  error: Error | null
}
