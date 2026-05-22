import fs from 'fs'
import path from 'path'
import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { assertLogWriteDirectoryAllowed } from '../lib/localPathPolicy.js'
import { sanitizeLogFileStem } from '../../shared/safeFileName.js'

/**
 * @param {Electron.IpcMain} ipcMain
 */
export function setupLogHandlers(ipcMain) {
  ipcMain.on('log:write', (e, logDir, logFileName, data) => {
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

  ipcMain.on('log:append', (e, logDir, logFileName, data) => {
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
