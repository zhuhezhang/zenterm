import type { IpcMain, IpcMainEvent } from 'electron'
import fs from 'fs'
import path from 'path'
import { INVALID_LABEL_CHARS } from '../../shared/safeFileName.js'
import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { assertLogWriteDirectoryAllowed } from '../lib/localPathPolicy.js'

/**
 * 日志文件主名：非法字符替换为下划线（log:write / log:append）
 */
export function sanitizeLogFileStem(raw: unknown) {
  return String(raw ?? '').replace(INVALID_LABEL_CHARS, '_').trim() || 'session'
}

/**
 * 日志写入处理程序
 */
export function setupLogHandlers(ipcMain: IpcMain) {
  ipcMain.on('log:write', (e: IpcMainEvent, logDir: unknown, logFileName: unknown, data: unknown) => {
    try {
      if (!isTrustedIpcSender(e.sender)) return
      if (!logDir) return
      assertLogWriteDirectoryAllowed(String(logDir))
      fs.mkdirSync(String(logDir), { recursive: true })
      const safeFileName = sanitizeLogFileStem(logFileName)
      const filePath = path.join(String(logDir), `${safeFileName}.log`)
      fs.writeFileSync(filePath, String(data ?? ''), 'utf8')
    } catch (err) {
      console.error('log:write error', err)
    }
  })

  ipcMain.on('log:append', (e: IpcMainEvent, logDir: unknown, logFileName: unknown, data: unknown) => {
    try {
      if (!isTrustedIpcSender(e.sender)) return
      if (!logDir || data == null || data === '') return
      assertLogWriteDirectoryAllowed(String(logDir))
      fs.mkdirSync(String(logDir), { recursive: true })
      const safeFileName = sanitizeLogFileStem(logFileName)
      const filePath = path.join(String(logDir), `${safeFileName}.log`)
      fs.appendFileSync(filePath, String(data), 'utf8')
    } catch (err) {
      console.error('log:append error', err)
    }
  })
}
