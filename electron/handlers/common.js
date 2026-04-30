/** ssh/sftp连接参数-密钥、压缩算法 */
const algorithms =
{
    kex: [  // 密钥交换(非对称加密，用于客户端和服务器之间协商对称加密算法等密钥)：新算法优先，兜底老旧DH
        'curve25519-sha256',
        'curve25519-sha256@libssh.org',
        'ecdh-sha2-nistp256',
        'ecdh-sha2-nistp384',
        'diffie-hellman-group14-sha256',
        'diffie-hellman-group14-sha1',
        'diffie-hellman-group-exchange-sha256'
    ],
    serverHostKey: [  // 主机密钥算法(用于验证服务器身份)：新版优先，强制兜底 ssh-rsa 老设备
        'ssh-ed25519',
        'ecdsa-sha2-nistp256',
        'ecdsa-sha2-nistp384',
        'rsa-sha2-256',
        'rsa-sha2-512',
        'ssh-rsa'
    ],
    cipher: [  // 加密算法(用于加密传输数据)：GCM安全优先，兜底老旧AES/3DES
        'aes128-gcm',
        'aes256-gcm',
        'aes128-ctr',
        'aes192-ctr',
        'aes256-ctr',
        'aes128-cbc',
        'aes192-cbc',
        'aes256-cbc',
        '3des-cbc'
    ],
    hmac: [  // 校验算法(用于验证数据完整性)：ETM安全优先，兜底老旧sha1
        'hmac-sha2-256-etm@openssh.com',
        'hmac-sha2-512-etm@openssh.com',
        'hmac-sha2-256',
        'hmac-sha2-512',
        'hmac-sha1'
    ],
    compress: [  // 压缩(用于压缩传输数据)：先尝试压缩，不行就不压缩
        'zlib@openssh.com',
        'zlib',
        'none'
    ]
}

module.exports = algorithms
