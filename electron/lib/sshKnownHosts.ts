/**
 * SSH 主机公钥指纹校验（类似 OpenSSH known_hosts），降低中间人风险。
 * 持久化存于 userData/zenterm-known-hosts.json；「仅信任一次」写入本会话内存缓存。
 */
import type { BrowserWindow } from 'electron'
import { app, dialog } from 'electron'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import ssh2 from 'ssh2'
import { translateMain } from '../i18n/translateMain.js'

/** ssh2 的 utils 模块，用于解析 SSH 主机公钥 */
const ssh2utils = ssh2.utils

/** 本会话内「仅信任一次」的临时指纹（不写入磁盘） */
const sessionHostKeyCache: Record<string, KnownHostEntry> = {}

/** 同一 host:port 并发校验时共用一个弹框 Promise，避免 SSH/SFTP 各弹一次 */
const pendingHostVerifications = new Map<string, Promise<boolean>>()

/**
 * 获取存储路径
 * mac 示例：/Users/zhuhezhang/Library/Application Support/zenterm/zenterm-known-hosts.json
 * windows 示例：C:\Users\zhuhezhang\AppData\Roaming\zenterm\zenterm-known-hosts.json
 * linux 示例：/home/zhuhezhang/.config/zenterm/zenterm-known-hosts.json
 * @returns 存储路径
 */
function storePath() {
  return path.join(app.getPath('userData'), 'zenterm-known-hosts.json')
}

/** 已知主机公钥条目 */
interface KnownHostEntry {
  /** SHA256 指纹 */
  sha256: string
  /** 密钥类型 */
  keyType: string
  /** 更新时间 */
  updatedAt: number
}

/** 已知主机公钥存储 */
type KnownHostStore = Record<string, KnownHostEntry>

/**
 * 加载存储数据
 * @returns 存储数据
 */
function loadStore(): KnownHostStore {
  try {
    const raw = fs.readFileSync(storePath(), 'utf8')
    const data = JSON.parse(raw)
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  } catch {
    return {}
  }
}

/**
 * 保存存储数据到文件
 * @param data 存储数据
 */
function saveStore(data: KnownHostStore) {
  const p = storePath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const tmp = `${p}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')  // 用 .tmp + rename 做原子替换，避免写一半损坏原文件
  fs.renameSync(tmp, p)
}

/**
 * 解析主机公钥类型
 * @param rawKey 主机公钥二进制
 * @returns 主机公钥类型
 */
function parseHostKeyType(rawKey: Buffer | string) {
  try {
    const pk = ssh2utils.parseKey(rawKey)
    if (!pk) return 'unknown'
    if (Array.isArray(pk)) return pk[0]?.type || 'unknown'
    return pk.type || 'unknown'
  } catch {
    return 'unknown'
  }
}

/** 清空本会话临时信任的指纹缓存 */
export function clearSessionHostKeyCache() {
  for (const key of Object.keys(sessionHostKeyCache)) {
    delete sessionHostKeyCache[key]
  }
}

/**
 * 弹框确认未知/变更主机密钥
 * @param parent 父窗口实例
 * @param hp 主机名或 IP
 * @param fp 指纹
 * @param keyType 密钥类型
 * @param existing 已存在的主机公钥条目
 * @param store 存储数据
 * @returns 是否信任
 */
async function promptHostKeyTrust(
  parent: BrowserWindow | null,
  hp: string,
  fp: string,
  keyType: string,
  existing: KnownHostEntry | undefined,
  store: KnownHostStore,
): Promise<boolean> {
  if (existing && existing.sha256 !== fp) {
    /* 指纹变更弹框选项 */
    const changedOptions = {
      type: 'error' as const,
      title: translateMain('sshKnownHosts.changed.title'),
      message: translateMain('sshKnownHosts.changed.message'),
      detail: translateMain('sshKnownHosts.changed.detail', {
        host: hp,
        keyType,
        savedSha256: existing.sha256,
        currentSha256: fp,
      }),
      buttons: [
        translateMain('sshKnownHosts.changed.disconnect'),
        translateMain('sshKnownHosts.changed.trustOnce'),
        translateMain('sshKnownHosts.changed.trustNew'),
      ],
      defaultId: 2,  // 回车默认「信任新密钥并保存」
      cancelId: 0,  // Esc 默认「否」断开连接
      noLink: true,
    }
    const { response } = parent
      ? await dialog.showMessageBox(parent, changedOptions)
      : await dialog.showMessageBox(changedOptions)
    if (response === 1) {  // 按了第二个按钮「仅信任一次」
      sessionHostKeyCache[hp] = { sha256: fp, keyType, updatedAt: Date.now() }  // 写入本会话临时信任
      return true
    }
    if (response === 2) {  // 按了第三个按钮「信任新密钥并保存」
      store[hp] = { sha256: fp, keyType, updatedAt: Date.now() }
      saveStore(store)
      delete sessionHostKeyCache[hp]
      return true
    }
    return false  // 按了第一个按钮「否」断开连接
  }

  /* 未知主机弹框选项 */
  const unknownOptions = {
    type: 'question' as const,
    title: translateMain('sshKnownHosts.unknown.title'),
    message: translateMain('sshKnownHosts.unknown.message'),
    detail: translateMain('sshKnownHosts.unknown.detail', {
      host: hp,
      keyType,
      sha256: fp,
    }),
    buttons: [
      translateMain('sshKnownHosts.unknown.cancel'),
      translateMain('sshKnownHosts.unknown.trustOnce'),
      translateMain('sshKnownHosts.unknown.trustSave'),
    ],
    defaultId: 2,
    cancelId: 0,
    noLink: true,
  }
  const { response } = parent
    ? await dialog.showMessageBox(parent, unknownOptions)
    : await dialog.showMessageBox(unknownOptions)
  if (response === 1) {
    sessionHostKeyCache[hp] = { sha256: fp, keyType, updatedAt: Date.now() }  // 写入本会话临时信任
    return true
  }
  if (response === 2) {
    store[hp] = { sha256: fp, keyType, updatedAt: Date.now() }
    saveStore(store)
    delete sessionHostKeyCache[hp]
    return true
  }
  return false
}

/**
 * 校验/提示是否信任 SSH 主机公钥；供主线程与 Worker 桥接共用。
 * 查找顺序：磁盘持久化 → 本会话内存 → 弹框
 * @param mainWindow 主窗口实例
 * @param host 主机名或 IP
 * @param port 端口
 * @param rawKey 主机公钥二进制
 * @returns 是否信任
 */
export async function verifySshHostKeyTrust(
  mainWindow: BrowserWindow | null | undefined,
  host: string,
  port: number,
  rawKey: Buffer,
) {
  const raw = Buffer.isBuffer(rawKey) ? rawKey : Buffer.from(rawKey)
  const fp = crypto.createHash('sha256').update(raw).digest('base64')
  const keyType = parseHostKeyType(raw)
  const hp = `${String(host ?? '').trim()}:${Number(port) || 22}`

  const store = loadStore()
  const existing = store[hp]
  if (existing?.sha256 === fp) {
    return true
  }

  const sessionCached = sessionHostKeyCache[hp]
  if (sessionCached?.sha256 === fp) {
    return true
  }

  const pending = pendingHostVerifications.get(hp)
  if (pending) {
    return pending
  }

  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
  const verification = (async () => {
    try {
      return await promptHostKeyTrust(parent, hp, fp, keyType, existing, store)
    } catch (e) {
      console.error('ssh hostVerifier dialog error', e)
      return false
    }
  })()

  pendingHostVerifications.set(hp, verification)
  try {
    return await verification
  } finally {
    pendingHostVerifications.delete(hp)
  }
}

/** 清空已保存的 SSH 已知主机公钥（zenterm-known-hosts.json） */
export function clearKnownHostsStore() {
  const p = storePath()
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p)
  } catch (e) {
    console.error('clearKnownHostsStore failed', e)
    throw e
  }
}

/**
 * 创建 SSH 主机公钥校验器：供 ssh2 connect({ hostVerifier }) 使用；须异步调用 callback(boolean)
 * @param mainWindow 主窗口实例
 * @param host 主机名或 IP
 * @param port 端口
 * @returns 主机公钥校验器
 */
export function createSshHostVerifier(
  mainWindow: BrowserWindow | null | undefined,
  host: string,
  port: number,
) {
  return function hostVerifier(key: Buffer, callback: (ok: boolean) => void) {
    void verifySshHostKeyTrust(mainWindow, host, port, Buffer.from(key))
      .then((ok) => {
        if (typeof callback === 'function') callback(ok)
      })
      .catch((e) => {
        console.error('ssh hostVerifier error', e)
        if (typeof callback === 'function') callback(false)
      })
  }
}
