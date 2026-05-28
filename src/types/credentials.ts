/** 凭据库同步涉及的敏感字段 */
export type VaultSecretKey = 'password' | 'privateKey' | 'passphrase'

export type VaultSecretPayload = Record<VaultSecretKey, string | null>

export type VaultSecretPartial = Partial<Record<VaultSecretKey, string>>
