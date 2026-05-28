/**
 * SSH/SFTP 算法默认偏好（与 ssh2 `algorithms` 字段结构一致）
 * 前后端共用：新建会话、重置默认、Worker 连接时使用
 */

/** 连接与设置的默认算法偏好：优先 AEAD、EtM MAC、现代 KEX/主机密钥；不含 CBC、SHA-1 HMAC、ssh-rsa、DH-group14-sha1 等 */
export interface AlgorithmPreferences {
  kex: string[]
  serverHostKey: string[]
  cipher: string[]
  hmac: string[]
  compress: string[]
}

/** 连接与设置的默认算法偏好：优先 AEAD、EtM MAC、现代 KEX/主机密钥；不含 CBC、SHA-1 HMAC、ssh-rsa、DH-group14-sha1 等 */
export const DEFAULT_ALGORITHM_PREFERENCES: AlgorithmPreferences = {
  kex: [ // 密钥交换算：用于协商加密密钥
    'curve25519-sha256@libssh.org',
    'curve25519-sha256',
    'ecdh-sha2-nistp521',
    'ecdh-sha2-nistp256',
    'ecdh-sha2-nistp384',
    'diffie-hellman-group18-sha512',
    'diffie-hellman-group16-sha512',
    'diffie-hellman-group14-sha256',
    'diffie-hellman-group-exchange-sha256',
    'diffie-hellman-group15-sha512',
    'diffie-hellman-group17-sha512',
  ],
  serverHostKey: [ // 服务器主机密钥：用于验证服务器身份
    'ssh-ed25519',
    'ecdsa-sha2-nistp256',
    'ecdsa-sha2-nistp384',
    'ecdsa-sha2-nistp521',
    'rsa-sha2-512',
    'rsa-sha2-256',
  ],
  cipher: [ // 加密算法：用于加密数据
    'aes128-gcm@openssh.com',
    'aes256-gcm@openssh.com',
    'aes128-ctr',
    'aes192-ctr',
    'aes256-ctr',
    'aes128-gcm',
    'aes256-gcm',
  ],
  hmac: [ // 消息认证码算法：用于验证数据完整性
    'hmac-sha2-256-etm@openssh.com',
    'hmac-sha2-512-etm@openssh.com',
    'hmac-sha1-etm@openssh.com',
    'hmac-sha2-256',
    'hmac-sha2-512',
  ],
  compress: [ // 压缩算法：用于压缩数据
    'zlib@openssh.com',
    'zlib',
    'none',
  ],
}
