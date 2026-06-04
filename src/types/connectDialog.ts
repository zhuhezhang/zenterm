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

/** SSH / Telnet 等协议共用的连接表单 props */
export interface SessionFormFieldsProps {
  form: SessionFormValues
  set: SessionFormSetter
  /** 为 false 时不渲染表单区块 */
  visible: boolean
  /** 输入框回车时触发（如保存并连接） */
  onEnter?: () => void
}

/** Serial 连接表单 props（路径须与枚举列表一致方可连接） */
export interface SerialFormProps extends SessionFormFieldsProps {
  /** 可用串口列表，用于 datalist 自动补全 */
  ports: { path?: string; manufacturer?: string }[]
  /** 重新枚举串口 */
  onRefreshPorts: () => void
}
