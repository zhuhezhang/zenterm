/**
 * SSH/SFTP 算法默认顺序与可选值（与 ssh2 `algorithms` 字段结构一致）。
 * 主进程连接与子进程设置 UI 共用，避免两处漂移。
 */
export const DEFAULT_ALGORITHM_PREFERENCES = {
  kex: [  // 密钥交换算法：用于协商 SSH 连接的密钥交换算法
    'curve25519-sha256',
    'curve25519-sha256@libssh.org',
    'ecdh-sha2-nistp256',
    'ecdh-sha2-nistp384',
    'diffie-hellman-group14-sha256',
    'diffie-hellman-group14-sha1',
    'diffie-hellman-group-exchange-sha256',
  ],
  serverHostKey: [  // 主机密钥算法：用于验证服务器身份的主机密钥算法
    'ssh-ed25519',
    'ecdsa-sha2-nistp256',
    'ecdsa-sha2-nistp384',
    'rsa-sha2-256',
    'rsa-sha2-512',
    'ssh-rsa',
  ],
  cipher: [  // 加密算法：用于加密传输数据的对称加密算法
    'aes128-gcm',
    'aes256-gcm',
    'aes128-ctr',
    'aes192-ctr',
    'aes256-ctr',
    'aes128-cbc',
    'aes192-cbc',
    'aes256-cbc',
    '3des-cbc',
  ],
  hmac: [  // 消息认证码算法：用于验证 SSH 数据完整性的哈希算法
    'hmac-sha2-256-etm@openssh.com',
    'hmac-sha2-512-etm@openssh.com',
    'hmac-sha2-256',
    'hmac-sha2-512',
    'hmac-sha1',
  ],
  compress: [  // 压缩算法：用于压缩传输数据的压缩算法
    'zlib@openssh.com',
    'zlib',
    'none',
  ],
}
