import fs from 'fs'
import path from 'path'
import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { assertLogWriteDirectoryAllowed } from '../lib/localPathPolicy.js'
import { sanitizeLogFileStem } from '../lib/safeFileName.js'

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
