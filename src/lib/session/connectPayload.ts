import type { AlgorithmPreferences } from '../../../shared/sshAlgorithmDefaults'
import type {
  SerialConnectConfig,
  SshConnectConfig,
  TelnetConnectConfig,
} from '../../../shared/zterm-api'
import type { ActiveSession } from '../../types/session'

/** 提取 SSH / SFTP 连接所需字段 */
export function pickSshConnectConfig(
  session: ActiveSession,
  algorithms?: Partial<AlgorithmPreferences>,
): SshConnectConfig {
  return {
    host: session.host,
    port: session.port,
    username: session.username,
    authType: session.authType,
    password: session.password,
    privateKey: session.privateKey,
    passphrase: session.passphrase,
    enableSftp: session.enableSftp,
    encoding: session.encoding,
    backspaceMode: session.backspaceMode,
    algorithms,
  }
}

export function pickTelnetConnectConfig(session: ActiveSession): TelnetConnectConfig {
  return {
    host: session.host,
    port: session.port,
    encoding: session.encoding,
    backspaceMode: session.backspaceMode,
  }
}

export function pickSerialConnectConfig(session: ActiveSession): SerialConnectConfig {
  return {
    path: session.path,
    baudRate: session.baudRate,
    dataBits: session.dataBits,
    stopBits: session.stopBits,
    parity: session.parity,
    encoding: session.encoding,
    backspaceMode: session.backspaceMode,
  }
}
