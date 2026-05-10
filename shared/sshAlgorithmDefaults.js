/**
 * SSH/SFTP 算法配置（与 ssh2 `algorithms` 字段结构一致）。
 * - DEFAULT_ALGORITHM_PREFERENCES：新建与「重置默认」使用的现代默认套件（不含已知弱算法）。
 * - SSH_ALGORITHM_OPTION_POOL：设置界面可选的全部算法（默认项在前，遗留项在后，用户可按需勾选）。
 */

/** 连接与设置的默认偏好：优先 AEAD、EtM MAC、现代 KEX/主机密钥；不含 CBC、SHA-1 HMAC、ssh-rsa、DH-group14-sha1 等 */
export const DEFAULT_ALGORITHM_PREFERENCES = {
  kex: [  // 密钥交换算法：用于协商 SSH 连接的密钥交换算法
    'curve25519-sha256@libssh.org',
    'curve25519-sha256',
    'ecdh-sha2-nistp256',
    'ecdh-sha2-nistp384',
    'ecdh-sha2-nistp521',
    'diffie-hellman-group-exchange-sha256',
    'diffie-hellman-group14-sha256',
    'diffie-hellman-group15-sha512',
    'diffie-hellman-group16-sha512',
    'diffie-hellman-group17-sha512',
    'diffie-hellman-group18-sha512'
  ],
  serverHostKey: [  // 主机密钥算法：用于验证服务器身份的主机密钥算法
    'ssh-ed25519',
    'ecdsa-sha2-nistp256',
    'ecdsa-sha2-nistp384',
    'ecdsa-sha2-nistp521',
    'rsa-sha2-512',
    'rsa-sha2-256'
  ],
  cipher: [  // 加密算法：用于加密传输数据的对称加密算法
    'aes128-gcm@openssh.com',
    'aes256-gcm@openssh.com',
    'aes128-ctr',
    'aes192-ctr',
    'aes256-ctr',
    'aes128-gcm',
    'aes256-gcm'
  ],
  hmac: [  // 消息认证码算法：用于验证 SSH 数据完整性的哈希算法
    'hmac-sha2-256-etm@openssh.com',
    'hmac-sha2-512-etm@openssh.com',
    'hmac-sha1-etm@openssh.com',
    'hmac-sha2-256',
    'hmac-sha2-512'
  ],
  compress: [  // 压缩算法：用于 SSH 连接压缩传输数据的算法
    'zlib@openssh.com',
    'zlib',
    'none'
  ],
}

/** 可与老旧 SSH 服务端兼容的遗留算法（单一数据源：选项池 = 默认 + 遗留；弱算法判定亦来源于此） */
const LEGACY_ALGORITHMS_BY_CATEGORY = {
  kex: [
    'diffie-hellman-group1-sha1',
    'diffie-hellman-group14-sha1',
    'diffie-hellman-group-exchange-sha1'
  ],
  serverHostKey: [
    'ssh-rsa',
    'ssh-dss'
  ],
  cipher: [
    'aes128-cbc',
    'aes192-cbc',
    'aes256-cbc',
    '3des-cbc'
  ],
  hmac: [
    'hmac-sha1',
    'hmac-md5',
    'hmac-sha2-256-96',
    'hmac-sha2-512-96',
    'hmac-ripemd160',
    'hmac-sha1-96',
    'hmac-md5-96'
  ],
  compress: [],
}

/** 设置页可选算法全集：在默认套件之后追加遗留算法 */
export const SSH_ALGORITHM_OPTION_POOL = Object.fromEntries(
  Object.keys(DEFAULT_ALGORITHM_PREFERENCES).map((key) => [
    key,
    [...DEFAULT_ALGORITHM_PREFERENCES[key], ...(LEGACY_ALGORITHMS_BY_CATEGORY[key] || [])],
  ])
)

/**
 * 是否属于遗留/较弱算法（用于设置 UI 提示）
 * @param {string} category kex | serverHostKey | cipher | hmac | compress
 * @param {string} name 算法名
 */
export function isWeakSshAlgorithm(category, name) {
  const arr = LEGACY_ALGORITHMS_BY_CATEGORY[category]
  return Array.isArray(arr) && arr.includes(name)
}
