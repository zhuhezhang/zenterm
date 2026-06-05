import type { AlgorithmPreferences } from '../../../shared/sshAlgorithmDefaults'
import type {
  SerialConnectConfig,
  SshConnectConfig,
  TelnetConnectConfig,
} from '../../../shared/zterm-api'
import type { AppSettings } from '../../types/settings'
import type { ActiveSshSession, ActiveTelnetSession, ActiveSerialSession } from '../../types/session'

/** 提取 SSH / SFTP 连接所需字段 */
export function pickSshConnectConfig(
  session: ActiveSshSession,
  sshSettings?: Pick<AppSettings, 'algorithmPreferences' | 'sshKeepaliveInterval'>,
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
    algorithms: sshSettings?.algorithmPreferences,
    sshKeepaliveInterval: sshSettings?.sshKeepaliveInterval,
  }
}

export function pickTelnetConnectConfig(session: ActiveTelnetSession): TelnetConnectConfig {
  return {
    host: session.host,
    port: session.port,
    encoding: session.encoding,
    backspaceMode: session.backspaceMode,
  }
}

export function pickSerialConnectConfig(session: ActiveSerialSession): SerialConnectConfig {
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
