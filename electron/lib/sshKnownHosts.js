/**
 * SSH 主机公钥指纹校验（类似 OpenSSH known_hosts），降低中间人风险。
 * 存于 userData/zterm-known-hosts.json；首次连接与指纹变更时由主进程弹框确认。
 */
import { app, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import ssh2 from 'ssh2'

/** ssh2 的 utils 模块，用于解析 SSH 主机公钥 */
const ssh2utils = ssh2.utils

/** 
 * 获取存储路径
 * mac 示例：/Users/zhuhezhang/Library/Application Support/zterm/zterm-known-hosts.json
 * windows 示例：C:\Users\zhuhezhang\AppData\Roaming\zterm\zterm-known-hosts.json
 * linux 示例：/home/zhuhezhang/.config/zterm/zterm-known-hosts.json
 * @returns {string} 存储路径
 */
function storePath() {
  return path.join(app.getPath('userData'), 'zterm-known-hosts.json')
}

/** 
 * 加载存储数据
 * @returns {Object} 存储数据
 */
function loadStore() {
  try {
    console.log('loadStore', storePath())
    const raw = fs.readFileSync(storePath(), 'utf8')
    const data = JSON.parse(raw)
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  } catch {
    return {}
  }
}

/**
 * 保存存储数据到文件
 * @param {Object} data 存储数据
 */
function saveStore(data) {
  const p = storePath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const tmp = `${p}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data), 'utf8')
  fs.renameSync(tmp, p)
}

/** 
 * 生成主机指纹查找键
 * @param {string} host 主机名或 IP
 * @param {number} port 端口
 * @returns {string} 主机指纹查找键
 */
export function knownHostLookupKey(host, port) {
  const h = String(host ?? '').trim()
  const p = Number(port) || 22
  return `${h}:${p}`
}

/** 
 * 生成主机公钥指纹：对主机公钥二进制做 SHA256 再 Base64（与 ssh-keygen -lf 展示一致）
 * @param {Buffer|string} rawKey 主机公钥二进制
 * @returns {string} 主机公钥指纹
 */
export function fingerprintHostKey(rawKey) {
  const buf = Buffer.isBuffer(rawKey) ? rawKey : Buffer.from(rawKey)
  return crypto.createHash('sha256').update(buf).digest('base64')
}

/**
 * 解析主机公钥类型
 * @param {Buffer|string} rawKey 主机公钥二进制
 * @returns {string} 主机公钥类型
 */
function parseHostKeyType(rawKey) {
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
 * 创建 SSH 主机公钥校验器：供 ssh2 connect({ hostVerifier }) 使用；须异步调用 callback(boolean)。
 * @param {Electron.BrowserWindow|null} mainWindow 主窗口实例
 * @param {string} host 主机名或 IP
 * @param {number} port 端口
 * @returns {Function} 主机公钥校验器
 */
export function createSshHostVerifier(mainWindow, host, port) {
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined

  return function hostVerifier(key, callback) {
    const raw = Buffer.isBuffer(key) ? key : Buffer.from(key)
    const fp = fingerprintHostKey(raw)
    const keyType = parseHostKeyType(raw)
    const hp = knownHostLookupKey(host, port)
    const store = loadStore()
    const existing = store[hp]

    const done = (ok) => {
      if (typeof callback === 'function') callback(ok)
    }

    if (existing && existing.sha256 === fp) {
      done(true)
      return
    }

    void (async () => {
      try {
        if (existing && existing.sha256 !== fp) {
          const { response } = await dialog.showMessageBox(parent, {
            type: 'error',
            title: 'SSH 主机密钥已变更',
            message: '与本地已保存的指纹不一致，可能存在中间人攻击。',
            detail: `主机: ${hp}\n密钥类型: ${keyType}\n已保存 SHA256: ${existing.sha256}\n当前 SHA256: ${fp}`,
            buttons: ['断开连接', '信任新密钥并继续'],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
          })
          if (response === 1) {
            store[hp] = { sha256: fp, keyType, updatedAt: Date.now() }
            saveStore(store)
            done(true)
          } else {
            done(false)
          }
          return
        }

        const { response } = await dialog.showMessageBox(parent, {
          type: 'question',
          title: '未知 SSH 主机',
          message: '尚未记录该主机的公钥指纹，是否信任并保存？',
          detail: `主机: ${hp}\n密钥类型: ${keyType}\nSHA256: ${fp}`,
          buttons: ['取消', '信任并保存'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        })
        if (response === 1) {
          store[hp] = { sha256: fp, keyType, updatedAt: Date.now() }
          saveStore(store)
          done(true)
        } else {
          done(false)
        }
      } catch (e) {
        console.error('ssh hostVerifier dialog error', e)
        done(false)
      }
    })()
  }
}
