import type { AlgorithmCategory } from '../../types/algorithm'
import { DEFAULT_ALGORITHM_PREFERENCES } from '../../../shared/sshAlgorithmDefaults'

/** 可与老旧 SSH 服务端兼容的遗留算法（选项池 = 默认 + 遗留；弱算法判定亦来源于此） */
const LEGACY_ALGORITHMS_BY_CATEGORY: Record<AlgorithmCategory, string[]> = {
  kex: [
    'diffie-hellman-group1-sha1',
    'diffie-hellman-group14-sha1',
    'diffie-hellman-group-exchange-sha1',
  ],
  serverHostKey: [
    'ssh-rsa',
    'ssh-dss',
  ],
  cipher: [
    'aes128-cbc',
    'aes192-cbc',
    'aes256-cbc',
    '3des-cbc',
  ],
  hmac: [
    'hmac-sha1',
    'hmac-md5',
    'hmac-sha2-256-96',
    'hmac-sha2-512-96',
    'hmac-ripemd160',
    'hmac-sha1-96',
    'hmac-md5-96',
  ],
  compress: [],
}

/** 设置页可选算法全集：在默认套件之后追加遗留算法 */
export const SSH_ALGORITHM_OPTION_POOL: Record<AlgorithmCategory, string[]> = Object.fromEntries(
  (Object.keys(DEFAULT_ALGORITHM_PREFERENCES) as AlgorithmCategory[]).map((key) => [
    key,
    [...DEFAULT_ALGORITHM_PREFERENCES[key], ...(LEGACY_ALGORITHMS_BY_CATEGORY[key] || [])],
  ]),
) as Record<AlgorithmCategory, string[]>

/**
 * 是否属于遗留/较弱算法（用于设置 UI 提示）
 * @param {string} category kex | serverHostKey | cipher | hmac | compress
 * @param {string} name 算法名
 */
export function isWeakSshAlgorithm(category: AlgorithmCategory, name: string) {
  const arr = LEGACY_ALGORITHMS_BY_CATEGORY[category]
  return Array.isArray(arr) && arr.includes(name)
}
