export interface AlgorithmPreferences {
  kex: string[]
  serverHostKey: string[]
  cipher: string[]
  hmac: string[]
  compress: string[]
}

export const DEFAULT_ALGORITHM_PREFERENCES: AlgorithmPreferences
