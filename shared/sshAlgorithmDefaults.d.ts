/** 连接与设置的默认算法偏好：优先 AEAD、EtM MAC、现代 KEX/主机密钥；不含 CBC、SHA-1 HMAC、ssh-rsa、DH-group14-sha1 等 */
export interface AlgorithmPreferences {
  kex: string[]
  serverHostKey: string[]
  cipher: string[]
  hmac: string[]
  compress: string[]
}

/** 连接与设置的默认算法偏好：优先 AEAD、EtM MAC、现代 KEX/主机密钥；不含 CBC、SHA-1 HMAC、ssh-rsa、DH-group14-sha1 等 */
export const DEFAULT_ALGORITHM_PREFERENCES: AlgorithmPreferences
