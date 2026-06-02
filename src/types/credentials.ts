export type {
  VaultSecretKey,
  VaultSecretPartial,
} from '../../shared/zterm-api.js'

export type VaultSecretPayload = Record<
  import('../../shared/zterm-api.js').VaultSecretKey,
  string | null
>
