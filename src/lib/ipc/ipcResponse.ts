import type { IpcContent, IpcResult } from '../../../shared/ipc'
import type { VaultGetContent } from '../../../shared/zterm-api'

type IpcLike = IpcResult<IpcContent> | null | undefined

export function isIpcSuccess(res: IpcLike): res is Extract<IpcLike, { success: true }> {
  return res != null && res.success === true
}

export function isIpcFailure(res: IpcLike): res is Extract<IpcLike, { success: false }> {
  return res != null && res.success === false
}

export function ipcContent(res: IpcLike): IpcContent {
  return res?.content && typeof res.content === 'object' ? res.content : {}
}

export function ipcErrorFields(res: IpcLike): {
  error: string
  errorParams: Record<string, string | number> | undefined
  errorKnown: boolean
} {
  const c = ipcContent(res)
  const errorParams =
    c.errorParams && typeof c.errorParams === 'object'
      ? (c.errorParams as Record<string, string | number>)
      : undefined

  return {
    error: String(c.error ?? ''),
    errorParams,
    errorKnown: res?.success === false ? res.errorKnown !== false : true,
  }
}

export function ipcPathFromResponse(res: IpcLike): string {
  if (!isIpcSuccess(res)) return ''
  const p = res.content?.path
  return typeof p === 'string' ? p : ''
}

export function ipcPortsFromResponse(res: IpcLike): unknown[] {
  const ports = ipcContent(res).ports
  return Array.isArray(ports) ? ports : []
}

const VAULT_SECRET_KEYS = ['password', 'privateKey', 'passphrase'] as const

export function vaultSecretsFromGetResponse(
  res: IpcResult<VaultGetContent> | null | undefined,
): { password?: string; privateKey?: string; passphrase?: string } {
  if (!isIpcSuccess(res)) return {}
  const c = res.content
  if (!('found' in c) || c.found !== true) return {}

  const secrets: { password?: string; privateKey?: string; passphrase?: string } = {}
  for (const k of VAULT_SECRET_KEYS) {
    const value = c[k]
    if (typeof value === 'string' && value) secrets[k] = value
  }
  return secrets
}
