import type { AlgorithmPreferences } from '../../shared/sshAlgorithmDefaults.js'
import { DEFAULT_ALGORITHM_PREFERENCES, DEFAULT_ALGORITHM_SELECTION } from '../../shared/sshAlgorithmDefaults.js'
import type { SshConnectConfig } from '../../shared/zterm-api.js'

function resolveKeepaliveIntervalMs(raw: unknown): number {
  const sec = Math.floor(Number(raw))
  if (!Number.isFinite(sec) || sec <= 0) return 0
  return sec * 1000
}

/**
 * 构建连接配置，用于 SSH 连接
 * @param cfg 配置
 * @param hostVerifier 主机公钥校验器
 * @returns 连接配置
 */
export function buildSshConnectConfig(
  cfg: SshConnectConfig,
  hostVerifier: (key: Buffer, callback: (ok: boolean) => void) => void,
): Record<string, unknown> {
  const connectConfig: Record<string, unknown> = {
    host: cfg.host,
    port: cfg.port || 22,
    username: cfg.username,
    readyTimeout: 60000,
    keepaliveInterval: resolveKeepaliveIntervalMs(cfg.sshKeepaliveInterval),
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
    connectConfig.algorithms = DEFAULT_ALGORITHM_SELECTION
  }

  if (cfg.authType === 'password') {
    connectConfig.password = cfg.password
  } else if (cfg.authType === 'privateKey') {
    connectConfig.privateKey = cfg.privateKey
    if (cfg.passphrase) connectConfig.passphrase = cfg.passphrase
  }

  return connectConfig
}
