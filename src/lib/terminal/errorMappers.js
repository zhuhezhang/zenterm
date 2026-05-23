import { isIpcErrorCode } from '../../../shared/ipcError.js'
import { formatIpcError } from '@/lib/ipc/formatIpcError.js'
import { translateRender } from '@/i18n/translateRender.js'

/**
 * 终端连接错误映射: IPC 错误码由 formatIpcError 翻译; 库/协议英文走 errors.* 模式.
 */

/**
 * 包装库/协议英文原始错误
 * @param {string} lang 语言
 * @param {string} key errors.* 键路径
 * @param {string} raw 原始错误文本
 */
function wrapLibraryError(lang, key, raw) {
  const t = (path, params) => translateRender(lang, path, params)
  const friendly = t(key)
  if (!raw) return friendly
  return t('errors.withRaw', { friendly, raw })
}

function extractRaw(err) {
  return String(err?.message || err?.error || err || '').trim()
}

function mapWithIpcOrLibrary(lang, raw, err, unknownKey, libraryMap) {
  if (isIpcErrorCode(raw)) {
    const t = (path, params) => translateRender(lang, path, params)
    return formatIpcError(t, raw, err?.errorParams) || translateRender(lang, unknownKey)
  }
  if (err?.errorKnown === false) return raw || translateRender(lang, unknownKey)
  if (!raw) return translateRender(lang, unknownKey)
  return libraryMap(raw)
}

/**
 * 映射 SSH 连接错误
 * @param {unknown} err 原始错误
 * @param {string} lang 语言
 */
export function mapSshError(err, lang) {
  const raw = extractRaw(err)
  return mapWithIpcOrLibrary(lang, raw, err, 'errors.ssh.unknown', (r) => {
    const lower = r.toLowerCase()
    if (lower.includes('all configured authentication methods failed') || lower.includes('permission denied')) {
      return wrapLibraryError(lang, 'errors.ssh.auth', r)
    }
    if (lower.includes('timed out while waiting for handshake') || lower.includes('etimedout')) {
      return wrapLibraryError(lang, 'errors.ssh.timeout', r)
    }
    if (lower.includes('econnrefused')) return wrapLibraryError(lang, 'errors.ssh.refused', r)
    if (lower.includes('enotfound') || lower.includes('getaddrinfo')) {
      return wrapLibraryError(lang, 'errors.ssh.dns', r)
    }
    if (lower.includes('ehostunreach') || lower.includes('enetunreach')) {
      return wrapLibraryError(lang, 'errors.ssh.net', r)
    }
    return wrapLibraryError(lang, 'errors.ssh.generic', r)
  })
}

export function mapSftpError(err, lang) {
  const raw = extractRaw(err)
  return mapWithIpcOrLibrary(lang, raw, err, 'errors.sftp.unknown', (r) => {
    const lower = r.toLowerCase()
    if (lower.includes('no matching key exchange algorithm')) {
      return wrapLibraryError(lang, 'errors.sftp.kex', r)
    }
    if (lower.includes('subsystem')) {
      return wrapLibraryError(lang, 'errors.sftp.subsystem', r)
    }
    return wrapLibraryError(lang, 'errors.sftp.generic', r)
  })
}

export function mapTelnetError(err, lang) {
  const raw = extractRaw(err)
  return mapWithIpcOrLibrary(lang, raw, err, 'errors.telnet.unknown', (r) => {
    const lower = r.toLowerCase()
    if (lower.includes('connection timeout') || lower.includes('etimedout')) {
      return wrapLibraryError(lang, 'errors.telnet.timeout', r)
    }
    if (lower.includes('econnrefused')) return wrapLibraryError(lang, 'errors.telnet.refused', r)
    if (lower.includes('enotfound') || lower.includes('getaddrinfo')) {
      return wrapLibraryError(lang, 'errors.telnet.dns', r)
    }
    if (lower.includes('ehostunreach') || lower.includes('enetunreach')) {
      return wrapLibraryError(lang, 'errors.telnet.net', r)
    }
    return wrapLibraryError(lang, 'errors.telnet.generic', r)
  })
}

export function mapSerialError(err, lang) {
  const raw = extractRaw(err)
  return mapWithIpcOrLibrary(lang, raw, err, 'errors.serial.unknown', (r) => {
    const lower = r.toLowerCase()
    if (lower.includes('cannot open') || lower.includes('access denied') || lower.includes('eperm') || lower.includes('eacces')) {
      return wrapLibraryError(lang, 'errors.serial.access', r)
    }
    if (lower.includes('no such file') || lower.includes('enoent')) {
      return wrapLibraryError(lang, 'errors.serial.missing', r)
    }
    if (lower.includes('baud')) return wrapLibraryError(lang, 'errors.serial.baud', r)
    return wrapLibraryError(lang, 'errors.serial.generic', r)
  })
}
