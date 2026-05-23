/**
 * 构建凭据同步载荷：根据会话配置和设置决定哪些凭据需要同步到加密存储
 * @param {object} config 完整会话配置（含明文敏感字段）
 * @param {object} settings 当前应用设置
 * @returns {object} 需要同步到加密存储的凭据对象
 */
export function buildSecretsSyncPayload(config, settings) {
  const keys = { password: null, privateKey: null, passphrase: null }
  const persist = !!settings.saveSecretsToVault  // 是否持久化到加密存储(!!表示强制转换为布尔值)
  if (config.type === 'ssh') {
    keys.password = persist && config.password ? config.password : null
    keys.privateKey = persist && config.privateKey ? config.privateKey : null
    keys.passphrase = persist && config.passphrase ? config.passphrase : null
    return keys
  }
  return keys // telnet / serial 等：不写入凭据；若误传 savedId 仅清空无关字段
}

/**
 * 同步会话凭据到加密存储
 * @param {string} savedId 会话 ID
 * @param {object} config 完整会话配置（含明文敏感字段）
 * @param {object} settings 当前应用设置
 * @returns {Promise<object>} 同步结果
 */
export async function syncSessionSecretsToVault(savedId, config, settings) {
  const api = window.zterm?.credentials
  if (!savedId || typeof savedId !== 'string') return { ok: true, skipped: true }
  if (!api?.sync) return { ok: true, skipped: true }
  const avail = await api.isAvailable?.()
  if (avail === false) return { ok: false, error: 'credentials.encryptionUnavailable' }
  const partial = buildSecretsSyncPayload(config, settings)
  return api.sync(savedId, partial)
}

/**
 * 从加密存储获取会话凭据
 * @param {string} savedId 会话 ID
 * @returns {Promise<object>} 会话凭据
 */
export async function fetchSessionSecrets(savedId) {
  const api = window.zterm?.credentials
  if (!savedId || !api?.get) return {}
  try {
    return (await api.get(savedId)) || {}
  } catch {
    return {}
  }
}

/**
 * 合并会话配置和加密存储中的凭据
 * @param {object} session 会话配置
 * @returns {Promise<object>} 合并后的会话配置
 */
export async function mergeSessionWithVaultSecrets(session) {
  if (!session?.savedId) return session
  const sec = await fetchSessionSecrets(session.savedId)
  return { ...session, ...sec }
}

/**
 * 删除加密存储中的会话凭据
 * @param {string} savedId 会话 ID
 * @returns {Promise<void>} 删除结果
 */
export async function removeVaultEntry(savedId) {
  await window.zterm?.credentials?.remove?.(savedId)
}

/**
 * 复制加密存储中的会话凭据
 * @param {string} fromId 源会话 ID
 * @param {string} toId 目标会话 ID
 * @returns {Promise<void>} 复制结果
 */
export async function duplicateVaultEntry(fromId, toId) {
  await window.zterm?.credentials?.duplicate?.(fromId, toId)
}

/**
 * 清除所有加密存储中的会话凭据
 * @returns {Promise<void>} 清除结果
 */
export async function clearAllVaultEntries() {
  await window.zterm?.credentials?.clearAll?.()
}

/**
 * 设置变更后：按新开关重新写入每条会话的 vault（需从 vault 读出再按策略裁剪）
 * @param {Array} savedSessions 不含明文的会话列表
 * @param {object} settings 当前应用设置
 */
export async function reapplyVaultPoliciesForAllSessions(savedSessions, settings) {
  const api = window.zterm?.credentials
  if (!api?.get || !api?.sync) return
  const avail = await api.isAvailable?.()
  if (avail === false) return
  for (const s of savedSessions) {
    if (!s.savedId || s.type !== 'ssh') continue
    const sec = await fetchSessionSecrets(s.savedId)
    const full = { ...s, ...sec }
    await api.sync(s.savedId, buildSecretsSyncPayload(full, settings))
  }
}

/**
 * 根据保存前后列表解析本次保存影响的 savedId
 * @param {Array} prevSessions 保存前的会话列表
 * @param {Array} nextSessions 保存后的会话列表
 * @param {object} config 会话配置
 * @returns {string|null} 影响的会话 ID
 */
export function resolveAffectedSavedId(prevSessions, nextSessions, config) {
  if (config?.savedId) return config.savedId
  const prevIds = new Set((prevSessions || []).map((s) => s.savedId))
  const added = (nextSessions || []).find((s) => s.savedId && !prevIds.has(s.savedId))
  return added?.savedId || null
}

/**
 * 导入的 JSON 可能含明文敏感字段：尽量写入 vault 后返回不含明文的会话列表
 * @param {Array} sessions 导入的会话列表
 * @returns {Promise<Array>} 不含明文的会话列表
 */
export async function absorbPlaintextSecretsFromImportedSessions(sessions) {
  if (!Array.isArray(sessions)) return sessions
  const api = window.zterm?.credentials
  const avail = api?.isAvailable ? await api.isAvailable() : false
  const out = []
  for (const s of sessions) {
    const copy = { ...s }
    if (avail && api?.sync && s.savedId) {
      if (s.type === 'ssh') {  // 如果是 SSH 会话，则设置凭据
        const partial = {}
        if (typeof s.password === 'string' && s.password) partial.password = s.password
        if (typeof s.privateKey === 'string' && s.privateKey) partial.privateKey = s.privateKey
        if (typeof s.passphrase === 'string' && s.passphrase) partial.passphrase = s.passphrase
        if (Object.keys(partial).length) await api.sync(s.savedId, partial)
      }
    }
    delete copy.password
    delete copy.privateKey
    delete copy.passphrase
    out.push(copy)
  }
  return out
}
