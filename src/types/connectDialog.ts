import type { SessionConfig, SessionFormValues } from './session'

/** ConnectDialog 内嵌凭据补全弹层状态 */
export interface ConnectCredDialogState {
  username: string
  password: string
  privateKey: string
  passphrase: string
  callback: (config: SessionConfig) => void
}

export type SessionFormSetter = <K extends keyof SessionFormValues>(
  k: K,
  v: SessionFormValues[K],
) => void

export interface SessionFormFieldsProps {
  form: SessionFormValues
  set: SessionFormSetter
  visible: boolean
}

export interface SerialFormProps extends SessionFormFieldsProps {
  ports: { path?: string; manufacturer?: string }[]
  onRefreshPorts: () => void
}
