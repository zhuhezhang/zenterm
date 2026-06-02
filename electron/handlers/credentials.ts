import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { app, safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'
import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { ipcFail, ipcOk } from '../lib/ipcResponse.js'
import type { VaultGetContent, VaultSecretPartial } from '../../shared/zterm-api.js'

interface VaultEntry {
  password?: string
  privateKey?: string
  passphrase?: string
}

interface Vault {
  v: number
  entries: Record<string, VaultEntry>
}

/**
 * 获取凭据存储文件路径
 */
function vaultPath() {
  return path.join(app.getPath('userData'), 'zterm-credentials-vault.json')
}

/**
 * 读取凭据存储文件
 */
function readVault(): Vault {
  try {
    const raw = fs.readFileSync(vaultPath(), 'utf8')
    const data = JSON.parse(raw) as Partial<Vault>
    if (!data || typeof data !== 'object') return { v: 1, entries: {} }
    if (!data.entries || typeof data.entries !== 'object') data.entries = {}
    return { v: data.v ?? 1, entries: data.entries }
  } catch {
    return { v: 1, entries: {} }
  }
}

/**
 * 写入凭据存储文件
 */
function writeVault(data: Vault) {
  const dir = path.dirname(vaultPath())
  fs.mkdirSync(dir, { recursive: true })
  const tmp = vaultPath() + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data), 'utf8')
  fs.renameSync(tmp, vaultPath())
}

/**
 * 加密字段
 */
function encryptField(plain: string) {
  const buf = safeStorage.encryptString(plain)
  return buf.toString('base64')
}

/**
 * 解密字段
 */
function decryptField(b64: string) {
  if (!b64 || typeof b64 !== 'string') return ''
  const buf = Buffer.from(b64, 'base64')
  return safeStorage.decryptString(buf)
}

/**
 * 注册凭据 IPC：使用 safeStorage 将敏感字段加密后写入 userData 下的 vault 文件
 */
function setupCredentialHandlers(ipcMain: IpcMain) {
  ipcMain.handle('credentials:isAvailable', (event: IpcMainInvokeEvent) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    return ipcOk({ available: safeStorage.isEncryptionAvailable() })
  })

  ipcMain.handle('credentials:get', async (event: IpcMainInvokeEvent, savedId: string) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (!savedId || typeof savedId !== 'string') {
      return ipcOk({ found: false, reason: 'invalidSavedId' } satisfies VaultGetContent)
    }
    if (!safeStorage.isEncryptionAvailable()) {
      return ipcOk({ found: false, reason: 'encryptionUnavailable' } satisfies VaultGetContent)
    }
    const vault = readVault()
    const enc = vault.entries[savedId]
    if (!enc || typeof enc !== 'object') {
      return ipcOk({ found: false, reason: 'notInVault' } satisfies VaultGetContent)
    }
    try {
      const secrets: Extract<VaultGetContent, { found: true }> = { found: true }
      if (enc.password) secrets.password = decryptField(enc.password)
      if (enc.privateKey) secrets.privateKey = decryptField(enc.privateKey)
      if (enc.passphrase) secrets.passphrase = decryptField(enc.passphrase)
      return ipcOk(secrets)
    } catch (e) {
      console.error('credentials:get decrypt error', e)
      return ipcOk({ found: false, reason: 'decryptFailed' } satisfies VaultGetContent)
    }
  })

  ipcMain.handle('credentials:sync', async (event: IpcMainInvokeEvent, savedId: string, partial: VaultSecretPartial) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (!savedId || typeof savedId !== 'string') return ipcFail('credentials.invalidSavedId', true)
    if (!safeStorage.isEncryptionAvailable()) {
      return ipcFail('credentials.encryptionUnavailable', true)
    }
    if (!partial || typeof partial !== 'object') return ipcFail('credentials.invalidSavedId', true)
    const vault = readVault()
    const cur = { ...(vault.entries[savedId] || {}) }
    const keys = ['password', 'privateKey', 'passphrase'] as const
    for (const k of keys) {
      if (!Object.prototype.hasOwnProperty.call(partial, k)) continue
      const v = partial[k]
      if (v === null || v === undefined || v === '') {
        delete cur[k]
      } else if (typeof v === 'string') {
        cur[k] = encryptField(v)
      }
    }
    if (Object.keys(cur).length === 0) delete vault.entries[savedId]
    else vault.entries[savedId] = cur
    writeVault(vault)
    return ipcOk()
  })

  ipcMain.handle('credentials:remove', async (event: IpcMainInvokeEvent, savedId: string) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (!savedId) return ipcOk()
    const vault = readVault()
    if (vault.entries[savedId]) {
      delete vault.entries[savedId]
      writeVault(vault)
    }
    return ipcOk()
  })

  ipcMain.handle('credentials:duplicate', async (event: IpcMainInvokeEvent, fromId: string, toId: string) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (!fromId || !toId) {
      return ipcFail('credentials.invalidSavedId', true)
    }
    const vault = readVault()
    if (vault.entries[fromId]) {
      vault.entries[toId] = { ...vault.entries[fromId] }
      writeVault(vault)
    }
    return ipcOk()
  })

  ipcMain.handle('credentials:clearAll', async (event: IpcMainInvokeEvent) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    try {
      if (fs.existsSync(vaultPath())) fs.unlinkSync(vaultPath())
    } catch (e) {
      console.error('credentials:clearAll', e)
    }
    return ipcOk()
  })
}

export { setupCredentialHandlers }
