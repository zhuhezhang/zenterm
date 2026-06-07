import type { SshConnectConfig } from '../../shared/zterm-api.js'
import { resolvePrivateKeyMaterial } from './resolvePrivateKeyMaterial.js'

/**
 * 主进程调用：将路径/PEM 输入解析为 Worker 可用的连接配置（私钥已展开为 PEM 内容）
 * @param cfg 配置
 * @returns 连接配置
 */
export function prepareSshConnectConfig(cfg: SshConnectConfig): SshConnectConfig {
  if (cfg.authType !== 'privateKey' || !cfg.privateKey?.trim()) {  // 若不是私钥认证，则直接返回
    return cfg
  }
  return {
    ...cfg,
    privateKey: resolvePrivateKeyMaterial(cfg.privateKey),  // 解析私钥
  }
}
