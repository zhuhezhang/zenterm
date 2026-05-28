import type { VaultSecretPayload, VaultSecretPartial } from '../types/credentials'
import type { AppSettings } from '../types/settings'
import type { SavedSession, SessionConfig } from '../types/session'
import type { IpcResult } from '../types/zterm'
import { vaultSecretsFromGetResponse } from '../lib/ipc/ipcResponse'

export function buildSecretsSyncPayload(config: SessionConfig, settings: AppSettings): VaultSecretPayload {
  const keys: VaultSecretPayload = { password: null, privateKey: null, passphrase: null }
  const persist = !!settings.saveSecretsToVault
  if (config.type === 'ssh') {
    keys.password = persist && typeof config.password === 'string' && config.password ? config.password : null
    keys.privateKey =
      persist && typeof config.privateKey === 'string' && config.privateKey ? config.privateKey : null
    keys.passphrase =
      persist && typeof config.passphrase === 'string' && config.passphrase ? config.passphrase : null
  }
  return keys
}

export async function syncSessionSecretsToVault(
  savedId: string,
  config: SessionConfig,
  settings: AppSettings,
): Promise<IpcResult | null> {
  const api = window.zterm?.credentials
  if (!savedId || typeof savedId !== 'string') return null
  if (!api?.sync) return null
  const partial = buildSecretsSyncPayload(config, settings)
  return api.sync(savedId, partial)
}

export async function fetchSessionSecrets(savedId: string): Promise<VaultSecretPartial> {
  const api = window.zterm?.credentials
  if (!savedId || !api?.get) return {}
  try {
    const res = await api.get(savedId)
    return vaultSecretsFromGetResponse(res)
  } catch {
    return {}
  }
}

export async function mergeSessionWithVaultSecrets<T extends SessionConfig>(session: T): Promise<T> {
  if (!session?.savedId || typeof session.savedId !== 'string') return session
  const sec = await fetchSessionSecrets(session.savedId)
  return { ...session, ...sec }
}

export async function removeVaultEntry(savedId: string): Promise<void> {
  await window.zterm?.credentials?.remove?.(savedId)
}

export async function duplicateVaultEntry(fromId: string, toId: string): Promise<void> {
  await window.zterm?.credentials?.duplicate?.(fromId, toId)
}

export async function clearAllVaultEntries(): Promise<void> {
  await window.zterm?.credentials?.clearAll?.()
}

export async function reapplyVaultPoliciesForAllSessions(
  savedSessions: SavedSession[],
  settings: AppSettings,
): Promise<void> {
  const api = window.zterm?.credentials
  if (!api?.get || !api?.sync) return
  const availRes = await api.isAvailable?.()
  if (!availRes?.success || availRes.content?.available === false) return

  for (const s of savedSessions) {
    if (!s.savedId || s.type !== 'ssh') continue
    const sec = await fetchSessionSecrets(s.savedId)
    const full: SessionConfig = { ...s, ...sec }
    await api.sync(s.savedId, buildSecretsSyncPayload(full, settings))
  }
}

export function resolveAffectedSavedId(
  prevSessions: SavedSession[],
  nextSessions: SavedSession[],
  config: SessionConfig,
): string | null {
  if (typeof config?.savedId === 'string' && config.savedId) return config.savedId
  const prevIds = new Set(prevSessions.map((s) => s.savedId))
  const added = nextSessions.find((s) => s.savedId && !prevIds.has(s.savedId))
  return added?.savedId || null
}

export async function absorbPlaintextSecretsFromImportedSessions(
  sessions: SavedSession[],
): Promise<SavedSession[]> {
  const api = window.zterm?.credentials
  const availRes = api?.isAvailable ? await api.isAvailable() : null
  const avail = availRes?.success && availRes.content?.available === true
  const out: SavedSession[] = []

  for (const s of sessions) {
    const copy: SavedSession = { ...s }
    if (avail && api?.sync && s.savedId && s.type === 'ssh') {
      const partial: VaultSecretPartial = {}
      if (typeof s.password === 'string' && s.password) partial.password = s.password
      if (typeof s.privateKey === 'string' && s.privateKey) partial.privateKey = s.privateKey
      if (typeof s.passphrase === 'string' && s.passphrase) partial.passphrase = s.passphrase
      if (Object.keys(partial).length) await api.sync(s.savedId, partial)
    }
    delete copy.password
    delete copy.privateKey
    delete copy.passphrase
    out.push(copy)
  }

  return out
}
