import type { AlgorithmPreferences } from '../../shared/sshAlgorithmDefaults.js'
import { DEFAULT_ALGORITHM_PREFERENCES } from '../../shared/sshAlgorithmDefaults.js'
import type { SshConnectConfig } from '../../shared/connectConfig.js'

/** 将渲染进程 SSH 连接载荷转为 ssh2 Client.connect 配置 */
export function buildSshConnectConfig(
  cfg: SshConnectConfig,
  hostVerifier: (key: Buffer, callback: (ok: boolean) => void) => void,
): Record<string, unknown> {
  const connectConfig: Record<string, unknown> = {
    host: cfg.host,
    port: cfg.port || 22,
    username: cfg.username,
    readyTimeout: 60000,
    keepaliveInterval: 10000,
    hostVerifier,
  }

  const algorithms = cfg.algorithms
  if (algorithms && typeof algorithms === 'object') {
    const filtered: Partial<AlgorithmPreferences> = {}
    for (const key in DEFAULT_ALGORITHM_PREFERENCES) {
      const k = key as keyof AlgorithmPreferences
      if (Array.isArray(algorithms[k]) && algorithms[k]!.length) {
        filtered[k] = algorithms[k]
      }
    }
    if (Object.keys(filtered).length) {
      connectConfig.algorithms = filtered
    }
  }
  if (!connectConfig.algorithms) {
    connectConfig.algorithms = DEFAULT_ALGORITHM_PREFERENCES
  }

  if (cfg.authType === 'password') {
    connectConfig.password = cfg.password
  } else if (cfg.authType === 'privateKey') {
    connectConfig.privateKey = cfg.privateKey
    if (cfg.passphrase) connectConfig.passphrase = cfg.passphrase
  }

  return connectConfig
}
