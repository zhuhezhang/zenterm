import { DEFAULT_TERMINAL_ENCODING } from '../../../shared/terminalEncodings.js'

export const PORT_MIN = 0
export const PORT_MAX = 65535

export const SESSION_TYPES = ['ssh', 'telnet', 'serial']
export const AUTH_TYPES = ['password', 'privateKey']

export const BAUD_RATES = [
  '110', '300', '600', '1200', '2400', '4800', '9600', '14400', '19200',
  '38400', '57600', '115200', '128000', '256000',
]
export const BAUD_RATE_SET = new Set(BAUD_RATES)

export const PARITIES = ['none', 'even', 'odd', 'mark', 'space']
export const PARITY_SET = new Set(PARITIES)

/** 各会话类型允许持久化到 localStorage 的字段 */
export const SESSION_TYPE_FIELDS = {
  ssh: ['host', 'port', 'username', 'authType', 'enableSftp', 'encoding', 'backspaceMode'],
  telnet: ['host', 'port', 'username', 'encoding', 'backspaceMode'],
  serial: ['path', 'baudRate', 'dataBits', 'stopBits', 'parity', 'encoding', 'backspaceMode'],
}

/** 标签名非法字符（与 ConnectDialog 一致） */
export const LABEL_ILLEGAL_CHARS_RE = /[/\\:*?"<>\x00]/
/** 分组名非法字符 */
export const GROUP_ILLEGAL_CHARS_RE = /[\\:*?"<>\x00]/

/** 连接对话框表单默认值（端口等为字符串，便于输入框绑定） */
export const SSH_FORM_DEFAULT = {
  host: '',
  port: '22',
  username: '',
  password: '',
  privateKey: '',
  passphrase: '',
  authType: 'password',
  label: '',
  group: '',
  enableSftp: false,
  encoding: DEFAULT_TERMINAL_ENCODING,
  backspaceMode: 'auto',
}

export const TELNET_FORM_DEFAULT = {
  host: '',
  port: '23',
  label: '',
  group: '',
  encoding: DEFAULT_TERMINAL_ENCODING,
  backspaceMode: 'auto',
}

export const SERIAL_FORM_DEFAULT = {
  path: '',
  baudRate: '9600',
  dataBits: '8',
  stopBits: '1',
  parity: 'none',
  label: '',
  group: '',
  encoding: DEFAULT_TERMINAL_ENCODING,
  backspaceMode: 'auto',
}

/** 保存/导入会话时的数值型默认值 */
export const SSH_STORAGE_DEFAULT = {
  host: '',
  port: 22,
  username: '',
  authType: 'password',
  enableSftp: false,
  encoding: DEFAULT_TERMINAL_ENCODING,
  backspaceMode: 'auto',
  label: '',
  group: '',
}

export const TELNET_STORAGE_DEFAULT = {
  host: '',
  port: 23,
  username: '',
  encoding: DEFAULT_TERMINAL_ENCODING,
  backspaceMode: 'auto',
  label: '',
  group: '',
}

export const SERIAL_STORAGE_DEFAULT = {
  path: '',
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  encoding: DEFAULT_TERMINAL_ENCODING,
  backspaceMode: 'auto',
  label: '',
  group: '',
}

/**
 * @param {'ssh'|'telnet'|'serial'} type
 * @returns {Record<string, unknown>}
 */
export function getSessionStorageDefaults(type) {
  if (type === 'ssh') return { ...SSH_STORAGE_DEFAULT }
  if (type === 'telnet') return { ...TELNET_STORAGE_DEFAULT }
  return { ...SERIAL_STORAGE_DEFAULT }
}

/**
 * @param {'ssh'|'telnet'|'serial'} type
 * @returns {Record<string, unknown>}
 */
export function getSessionFormDefaults(type) {
  if (type === 'ssh') return { ...SSH_FORM_DEFAULT }
  if (type === 'telnet') return { ...TELNET_FORM_DEFAULT }
  return { ...SERIAL_FORM_DEFAULT }
}
