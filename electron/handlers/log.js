import fs from 'fs'
import path from 'path'
import { INVALID_LABEL_CHARS } from '../../shared/safeFileName.js'
import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { assertLogWriteDirectoryAllowed } from '../lib/localPathPolicy.js'

/**
 * 日志文件主名：非法字符替换为下划线（log:write / log:append）
 * @param {string} raw 原始文件名
 * @returns {string} 安全文件名
 */
export function sanitizeLogFileStem(raw) {
  return String(raw ?? '').replace(INVALID_LABEL_CHARS, '_').trim() || 'session'
}

/**
 * 日志写入处理程序
 * @param {Electron.IpcMain} ipcMain ipcMain 实例
 */
export function setupLogHandlers(ipcMain) {
  ipcMain.on('log:write', (e, logDir, logFileName, data) => {  // 写入日志
    try {
      if (!isTrustedIpcSender(e.sender)) return
      if (!logDir) return
      assertLogWriteDirectoryAllowed(logDir)
      fs.mkdirSync(logDir, { recursive: true })
      const safeFileName = sanitizeLogFileStem(logFileName)
      const filePath = path.join(logDir, `${safeFileName}.log`)
      fs.writeFileSync(filePath, data, 'utf8')
    } catch (err) {
      console.error('log:write error', err)
    }
  })

  ipcMain.on('log:append', (e, logDir, logFileName, data) => {  // 追加日志
    try {
      if (!isTrustedIpcSender(e.sender)) return
      if (!logDir || data == null || data === '') return
      assertLogWriteDirectoryAllowed(logDir)
      fs.mkdirSync(logDir, { recursive: true })
      const safeFileName = sanitizeLogFileStem(logFileName)
      const filePath = path.join(logDir, `${safeFileName}.log`)
      fs.appendFileSync(filePath, String(data), 'utf8')
    } catch (err) {
      console.error('log:append error', err)
    }
  })
}
