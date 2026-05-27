import { app, safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'
import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { ipcFail, ipcOk } from '../lib/ipcResponse.js'

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
 * @param {Electron.IpcMain} ipcMain IPC 主进程
 */
function setupCredentialHandlers(ipcMain) {
  ipcMain.handle('credentials:isAvailable', (event) => {  // 检查系统是否支持加密存储
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    return ipcOk({ available: safeStorage.isEncryptionAvailable() })
  })

  ipcMain.handle('credentials:get', async (event, savedId) => {  // 根据会话 ID 获取指定会话的凭据
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (!savedId || typeof savedId !== 'string') {
      return ipcOk({ found: false, reason: 'invalidSavedId' })
    }
    if (!safeStorage.isEncryptionAvailable()) {
      return ipcOk({ found: false, reason: 'encryptionUnavailable' })
    }
    const vault = readVault()
    const enc = vault.entries[savedId]
    if (!enc || typeof enc !== 'object') {
      return ipcOk({ found: false, reason: 'notInVault' })
    }
    const secrets = { found: true }
    try {
      if (enc.password) secrets.password = decryptField(enc.password)
      if (enc.privateKey) secrets.privateKey = decryptField(enc.privateKey)
      if (enc.passphrase) secrets.passphrase = decryptField(enc.passphrase)
    } catch (e) {
      console.error('credentials:get decrypt error', e)
      return ipcOk({ found: false, reason: 'decryptFailed' })
    }
    return ipcOk(secrets)
  })

  ipcMain.handle('credentials:sync', async (event, savedId, partial) => {  // 同步会话凭据到加密存储，参数为会话ID、同步凭据对象（每个值为 string 写入；null/undefined/'' 表示删除该键，返回同步结果）
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (!savedId || typeof savedId !== 'string') return ipcFail('credentials.invalidSavedId', true)
    if (!safeStorage.isEncryptionAvailable()) {
      return ipcFail('credentials.encryptionUnavailable', true)
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
    return ipcOk()
  })

  ipcMain.handle('credentials:remove', async (event, savedId) => {  // 删除会话凭据，参数为会话ID，返回删除结果
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (!savedId || typeof savedId !== 'string') return ipcOk()
    const vault = readVault()
    if (vault.entries[savedId]) {
      delete vault.entries[savedId]
      writeVault(vault)
    }
    return ipcOk()
  })

  ipcMain.handle('credentials:duplicate', async (event, fromId, toId) => {  // 复制会话凭据，参数为源会话ID、目标会话ID，返回复制结果
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (!fromId || !toId || typeof fromId !== 'string' || typeof toId !== 'string') {
      return ipcFail('credentials.invalidSavedId', true)
    }
    const vault = readVault()
    if (vault.entries[fromId]) {
      vault.entries[toId] = { ...vault.entries[fromId] }
      writeVault(vault)
    }
    return ipcOk()
  })

  ipcMain.handle('credentials:clearAll', async (event) => {  // 清除所有会话凭据，返回清除结果
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
