import { app, safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'
import { isTrustedIpcSender, CRED_UNAUTHORIZED } from '../lib/trustedSender.js'

/**
 * 获取凭据存储文件路径
 * @returns {string} 凭据存储文件路径
 */
function vaultPath() {
  return path.join(app.getPath('userData'), 'zterm-credentials-vault.json')
}

/**
 * 读取凭据存储文件
 * @returns {object} 凭据存储文件内容
 */
function readVault() {
  try {
    const raw = fs.readFileSync(vaultPath(), 'utf8')
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return { v: 1, entries: {} }
    if (!data.entries || typeof data.entries !== 'object') data.entries = {}
    return data
  } catch {
    return { v: 1, entries: {} }
  }
}

/**
 * 写入凭据存储文件
 * @param {object} data 凭据存储文件内容
 */
function writeVault(data) {
  const dir = path.dirname(vaultPath())
  fs.mkdirSync(dir, { recursive: true })
  const tmp = vaultPath() + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data), 'utf8')
  fs.renameSync(tmp, vaultPath())
}

/**
 * 加密字段
 * @param {string} plain 明文字段
 * @returns {string} 加密后的字段
 */
function encryptField(plain) {
  const buf = safeStorage.encryptString(plain)
  return buf.toString('base64')
}

/**
 * 解密字段
 * @param {string} b64 加密后的字段
 * @returns {string} 明文字段
 */
function decryptField(b64) {
  if (!b64 || typeof b64 !== 'string') return ''
  const buf = Buffer.from(b64, 'base64')
  return safeStorage.decryptString(buf)
}

/**
 * 注册凭据 IPC：使用 safeStorage 将敏感字段加密后写入 userData 下的 vault 文件
 * @param {Electron.IpcMain} ipcMain
 */
function setupCredentialHandlers(ipcMain) {
  ipcMain.handle('credentials:isAvailable', (event) => {
    if (!isTrustedIpcSender(event.sender)) return false
    return safeStorage.isEncryptionAvailable()
  })

  ipcMain.handle('credentials:get', async (event, savedId) => {
    if (!isTrustedIpcSender(event.sender)) return {}
    if (!savedId || typeof savedId !== 'string') return {}
    if (!safeStorage.isEncryptionAvailable()) return {}
    const vault = readVault()
    const enc = vault.entries[savedId]
    if (!enc || typeof enc !== 'object') return {}
    const out = {}
    try {
      if (enc.password) out.password = decryptField(enc.password)
      if (enc.privateKey) out.privateKey = decryptField(enc.privateKey)
      if (enc.passphrase) out.passphrase = decryptField(enc.passphrase)
    } catch (e) {
      console.error('credentials:get decrypt error', e)
    }
    return out
  })

  /**
   * 同步会话凭据到加密存储
   * @param {string} savedId 会话 ID
   * @param {object} partial 需要同步的凭据对象，每个值为 string 写入；null/undefined/'' 表示删除该键
   * @returns {object} 同步结果
   */
  ipcMain.handle('credentials:sync', async (event, savedId, partial) => {
    if (!isTrustedIpcSender(event.sender)) return CRED_UNAUTHORIZED
    if (!savedId || typeof savedId !== 'string') return { ok: false, error: 'invalid savedId' }
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: '系统安全存储不可用（例如 Linux 未配置密钥环）。无法加密保存凭据。' }
    }
    const vault = readVault()
    const cur = { ...(vault.entries[savedId] || {}) }
    const keys = ['password', 'privateKey', 'passphrase']
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
    return { ok: true }
  })

  /**
   * 删除会话凭据
   * @param {string} savedId 会话 ID
   * @returns {object} 删除结果
   */
  ipcMain.handle('credentials:remove', async (event, savedId) => {
    if (!isTrustedIpcSender(event.sender)) return CRED_UNAUTHORIZED
    if (!savedId || typeof savedId !== 'string') return { ok: true }
    const vault = readVault()
    if (vault.entries[savedId]) {
      delete vault.entries[savedId]
      writeVault(vault)
    }
    return { ok: true }
  })

  /**
   * 复制会话凭据
   * @param {string} fromId 源会话 ID
   * @param {string} toId 目标会话 ID
   * @returns {object} 复制结果
   */
  ipcMain.handle('credentials:duplicate', async (event, fromId, toId) => {
    if (!isTrustedIpcSender(event.sender)) return CRED_UNAUTHORIZED
    if (!fromId || !toId || typeof fromId !== 'string' || typeof toId !== 'string') return { ok: false }
    const vault = readVault()
    if (vault.entries[fromId]) {
      vault.entries[toId] = { ...vault.entries[fromId] }
      writeVault(vault)
    }
    return { ok: true }
  })

  /**
   * 清除所有会话凭据
   * @returns {object} 清除结果
   */
  ipcMain.handle('credentials:clearAll', async (event) => {
    if (!isTrustedIpcSender(event.sender)) return CRED_UNAUTHORIZED
    try {
      if (fs.existsSync(vaultPath())) fs.unlinkSync(vaultPath())
    } catch (e) {
      console.error('credentials:clearAll', e)
    }
    return { ok: true }
  })
}

export { setupCredentialHandlers }
