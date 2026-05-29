import type { AlgorithmPreferences } from '../../shared/sshAlgorithmDefaults.js'
import { DEFAULT_ALGORITHM_PREFERENCES } from '../../shared/sshAlgorithmDefaults.js'
import type { SshConnectConfig } from '../../shared/zterm-api.js'

/**
 * 构建连接配置，用于 SSH 连接
 * @param cfg 配置
 * @param cfg.host 主机名
 * @param cfg.port 端口
 * @param cfg.username 用户名
 * @param cfg.algorithms 算法
 * @param cfg.algorithms.kex 密钥交换算法
 * @param cfg.algorithms.serverHostKey 服务器主机密钥算法
 * @param cfg.algorithms.cipher 加密算法
 * @param cfg.algorithms.hmac 消息认证码算法
 * @param cfg.algorithms.compress 压缩算法
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
