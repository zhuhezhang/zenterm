/**
 * SSH 主机公钥指纹校验（类似 OpenSSH known_hosts），降低中间人风险。
 * 存于 userData/zterm-known-hosts.json；首次连接与指纹变更时由主进程弹框确认。
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

/**
 * 获取存储路径
 * mac 示例：/Users/zhuhezhang/Library/Application Support/zterm/zterm-known-hosts.json
 * windows 示例：C:\Users\zhuhezhang\AppData\Roaming\zterm\zterm-known-hosts.json
 * linux 示例：/home/zhuhezhang/.config/zterm/zterm-known-hosts.json
 * @returns 存储路径
 */
function storePath() {
  return path.join(app.getPath('userData'), 'zterm-known-hosts.json')
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
  fs.writeFileSync(tmp, JSON.stringify(data), 'utf8')
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

/**
 * 校验/提示是否信任 SSH 主机公钥（与 known_hosts 一致），供主线程与 Worker 桥接共用
 * @param mainWindow 主窗口实例
 * @param host 主机名或 IP
 * @param port 端口
 * @param rawKey 主机公钥二进制
 * @returns 是否允许继续握手
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
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null

  if (existing && existing.sha256 === fp) {
    return true
  }

  try {
    if (existing && existing.sha256 !== fp) {
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
          translateMain('sshKnownHosts.changed.trustNew'),
        ],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      }
      const { response } = parent
        ? await dialog.showMessageBox(parent, changedOptions)
        : await dialog.showMessageBox(changedOptions)
      if (response === 1) {
        store[hp] = { sha256: fp, keyType, updatedAt: Date.now() }
        saveStore(store)
        return true
      }
      return false
    }

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
        translateMain('sshKnownHosts.unknown.trustSave'),
      ],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    }
    const { response } = parent
      ? await dialog.showMessageBox(parent, unknownOptions)
      : await dialog.showMessageBox(unknownOptions)
    if (response === 1) {
      store[hp] = { sha256: fp, keyType, updatedAt: Date.now() }
      saveStore(store)
      return true
    }
    return false
  } catch (e) {
    console.error('ssh hostVerifier dialog error', e)
    return false
  }
}

/**
 * 创建 SSH 主机公钥校验器：供 ssh2 connect({ hostVerifier }) 使用；须异步调用 callback(boolean)。
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
