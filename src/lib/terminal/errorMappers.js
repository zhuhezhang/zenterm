import { translateRender } from '@/i18n/translateRender.js'

/**
 * 映射 SSH 连接错误
 * @param {unknown} err 错误对象
 * @param {string} lang 语言
 * @returns {string} 映射后的错误提示
 */
export function mapSshError(err, lang) {
  const raw = String(err?.message || err?.error || err || '').trim()  // 原始错误文本
  const lower = raw.toLowerCase()
  const w = (key) => {
    const friendly = translateRender(lang, key)  // 友好提示
    if (!raw) return friendly
    return translateRender(lang, 'errors.withRaw', { friendly, raw })  // 拼接错误提示
  }

  if (!raw) return translateRender(lang, 'errors.ssh.unknown')
  if (lower.includes('all configured authentication methods failed') || lower.includes('permission denied')) {
    return w('errors.ssh.auth')
  }
  if (lower.includes('timed out while waiting for handshake') || lower.includes('etimedout')) {
    return w('errors.ssh.timeout')
  }
  if (lower.includes('econnrefused')) {
    return w('errors.ssh.refused')
  }
  if (lower.includes('enotfound') || lower.includes('getaddrinfo')) {
    return w('errors.ssh.dns')
  }
  if (lower.includes('ehostunreach') || lower.includes('enetunreach')) {
    return w('errors.ssh.net')
  }
  return w('errors.ssh.generic')
}

/**
 * 映射 SFTP 连接错误
 * @param {unknown} err 错误对象
 * @param {string} lang 语言
 * @returns {string} 映射后的错误提示
 */
export function mapSftpError(err, lang) {
  const raw = String(err?.message || err?.error || err || '').trim()  // 原始错误文本
  const lower = raw.toLowerCase()
  const w = (key) => {
    const friendly = translateRender(lang, key)  // 友好提示
    if (!raw) return friendly
    return translateRender(lang, 'errors.withRaw', { friendly, raw })  // 拼接错误提示
  }

  if (!raw) return translateRender(lang, 'errors.sftp.unknown')
  if (lower.includes('no matching key exchange algorithm')) {
    return w('errors.sftp.kex')
  }
  if (lower.includes('start subsystem') || lower.includes('sftp')) {
    return w('errors.sftp.subsystem')
  }
  return w('errors.sftp.generic')
}

/**
 * 映射 Telnet 连接错误
 * @param {unknown} err 错误对象
 * @param {string} lang 语言
 * @returns {string} 映射后的错误提示
 */
export function mapTelnetError(err, lang) {
  const raw = String(err?.message || err?.error || err || '').trim()  // 原始错误文本
  const lower = raw.toLowerCase()
  const w = (key) => {
    const friendly = translateRender(lang, key)  // 友好提示
    if (!raw) return friendly
    return translateRender(lang, 'errors.withRaw', { friendly, raw })  // 拼接错误提示
  }

  if (!raw) return translateRender(lang, 'errors.telnet.unknown')
  if (lower.includes('connection timeout') || lower.includes('etimedout')) {
    return w('errors.telnet.timeout')
  }
  if (lower.includes('econnrefused')) {
    return w('errors.telnet.refused')
  }
  if (lower.includes('enotfound') || lower.includes('getaddrinfo')) {
    return w('errors.telnet.dns')
  }
  if (lower.includes('ehostunreach') || lower.includes('enetunreach')) {
    return w('errors.telnet.net')
  }
  return w('errors.telnet.generic')
}

/**
 * 映射串口连接错误
 * @param {unknown} err 错误对象
 * @param {string} lang 语言
 * @returns {string} 映射后的错误提示
 */
export function mapSerialError(err, lang) {
  const raw = String(err?.message || err?.error || err || '').trim()  // 原始错误文本
  const lower = raw.toLowerCase()
  const w = (key) => {
    const friendly = translateRender(lang, key)  // 友好提示
    if (!raw) return friendly
    return translateRender(lang, 'errors.withRaw', { friendly, raw })  // 拼接错误提示
  }

  if (!raw) return translateRender(lang, 'errors.serial.unknown')
  if (lower.includes('cannot open') || lower.includes('access denied') || lower.includes('eperm') || lower.includes('eacces')) {
    return w('errors.serial.access')
  }
  if (lower.includes('no such file') || lower.includes('enoent')) {
    return w('errors.serial.missing')
  }
  if (lower.includes('baud')) {
    return w('errors.serial.baud')
  }
  return w('errors.serial.generic')
}
