import { Client } from 'ssh2'
import fs from 'fs'
import { DEFAULT_ALGORITHM_PREFERENCES } from '../../shared/sshAlgorithmDefaults.js'
import { isTrustedIpcSender, IPC_UNAUTHORIZED } from '../lib/trustedSender.js'
import {
  assertSftpLocalFilePathAllowed,
  assertSftpLocalDirAllowed,
  safeJoinLocalDownloadPath,
} from '../lib/localPathPolicy.js'
import { createSshHostVerifier } from '../lib/sshKnownHosts.js'

/** 存储所有 SFTP 会话信息的 Map */
const sftpSessions = new Map()

/**
 * 设置 SFTP 相关的 IPC 处理函数，传入 ipcMain 和 mainWindow 以便在处理函数中使用 IPC 和窗口通信
 * @param {Electron.IpcMain} ipcMain Electron 的 IPC 主进程模块，用于监听和处理来自渲染进程的 IPC 消息
 * @param {Electron.BrowserWindow} mainWindow 主窗口实例，用于在处理函数中向渲染进程发送 IPC 消息 
 */
function setupSFTPHandlers(ipcMain, mainWindow) {
  /** 
   * 读取远程服务器目录
   * @param {Object} session SFTP 会话对象
   * @param {string} remotePath 远程服务器目录路径
   */
  const sftpReaddir = (session, remotePath) => new Promise((resolve, reject) => {
    session.sftp.readdir(remotePath, (err, list) => (err ? reject(err) : resolve(list)))
  })
  /** 
   * 删除远程服务器文件
   * @param {Object} session SFTP 会话对象
   * @param {string} remotePath 远程服务器文件路径
   */
  const sftpUnlink = (session, remotePath) => new Promise((resolve, reject) => {
    session.sftp.unlink(remotePath, (err) => (err ? reject(err) : resolve()))
  })
  /** 
   * 删除远程服务器目录
   * @param {Object} session SFTP 会话对象
   * @param {string} remotePath 远程服务器目录路径
   */
  const sftpRmdir = (session, remotePath) => new Promise((resolve, reject) => {
    session.sftp.rmdir(remotePath, (err) => (err ? reject(err) : resolve()))
  })

  /** 
   * 递归删除远程服务器文件（目录）
   * @param {Object} session SFTP 会话对象
   * @param {string} remotePath 远程服务器文件（目录）路径
   */
  const deleteRecursive = async (session, remotePath) => {
    try {
      await sftpUnlink(session, remotePath)
      return
    } catch (e) {  // 不是文件，可能是目录，尝试删除目录
    }
    let list
    try {
      list = await sftpReaddir(session, remotePath)
    } catch (e) {
      await sftpRmdir(session, remotePath)  // 如果无法读取目录，尝试直接删除目录
      return
    }
    for (const item of list) {  // 递归删除远程服务器文件（目录）
      const name = item.filename
      const child = remotePath === '/' ? '/' + name : remotePath + '/' + name
      if (item.attrs.isDirectory()) await deleteRecursive(session, child)  // 如果是目录，递归删除
      else await sftpUnlink(session, child)  // 如果是文件，删除文件
    }
    await sftpRmdir(session, remotePath)
  }

  /** 
   * 递归下载远程服务器目录到本地目录
   * @param {Object} session SFTP 会话对象
   * @param {string} id 会话 ID
   * @param {string} remoteDir 远程服务器目录路径
   * @param {string} localDir 本地保存目录路径
   */
  const downloadDirRecursive = async (session, id, remoteDir, localDir) => {
    assertSftpLocalDirAllowed(localDir, '下载')
    fs.mkdirSync(localDir, { recursive: true })  // 确保本地目录存在（recursive可以创建多级目录）
    const list = await sftpReaddir(session, remoteDir)
    for (const item of list) {
      const name = item.filename
      const remotePath = remoteDir === '/' ? '/' + name : remoteDir + '/' + name
      const localPath = safeJoinLocalDownloadPath(localDir, name, '下载')
      if (item.attrs.isDirectory()) {
        await downloadDirRecursive(session, id, remotePath, localPath)
      } else {
        await new Promise((resolve, reject) => {
          session.sftp.fastGet(remotePath, localPath, {
            step: (transferred, _chunk, total_size) => {
              mainWindow.webContents.send('sftp:progress', id, {
                type: 'download',
                file: remotePath,
                transferred,
                total: total_size,
                percent: total_size ? Math.round((transferred / total_size) * 100) : 0,
              })
            },
          }, (err) => (err ? reject(err) : resolve()))
        })
      }
    }
  }
  ipcMain.handle('sftp:connect', async (event, id, config) => {
    if (!isTrustedIpcSender(event.sender)) return IPC_UNAUTHORIZED
    return new Promise((resolve, _reject) => {
      const conn = new Client()

      conn.on('ready', () => {  // 监听 ready 事件（SSH 认证成功后触发）
        conn.sftp((err, sftp) => {  // 调用 conn.sftp() 获取 SFTP 会话
          if (err) {
            conn.end()
            return resolve({ success: false, error: err.message })
          }
          sftpSessions.set(id, { conn, sftp })  // 保存连接信息；没有单独的 SFTP 连接对象，直接在会话对象中保存 sftp 实例
          resolve({ success: true })
        })
      })

      conn.on('error', (err) => {
        resolve({ success: false, error: err.message })
      })

      /** 构建连接配置对象，根据用户选择的认证方式（密码或私钥）设置相应的属性，并调用 conn.connect() 发起 SSH 连接请求 */
      const connectConfig = {
        host: config.host,
        port: config.port || 22,
        username: config.username,
        readyTimeout: 60000,  // 连接超时60秒
      }

      if (config.algorithms && typeof config.algorithms === 'object') {
        const filtered = {}
        for (const key of ['kex', 'serverHostKey', 'cipher', 'hmac', 'compress']) {
          if (Array.isArray(config.algorithms[key]) && config.algorithms[key].length) {
            filtered[key] = config.algorithms[key]
          }
        }
        if (Object.keys(filtered).length) {
          connectConfig.algorithms = filtered
        }
      }
      if (!connectConfig.algorithms) {
        connectConfig.algorithms = DEFAULT_ALGORITHM_PREFERENCES
      }

      if (config.authType === 'password') {
        connectConfig.password = config.password
      } else if (config.authType === 'privateKey') {
        connectConfig.privateKey = config.privateKey
        if (config.passphrase) connectConfig.passphrase = config.passphrase
      }

      connectConfig.hostVerifier = createSshHostVerifier(
        mainWindow,
        config.host,
        connectConfig.port
      )

      try {
        conn.connect(connectConfig)  // 发起 SSH 连接请求，连接结果将通过 ready 和 error 事件处理器处理
      } catch (e) {
        resolve({ success: false, error: e.message })
      }
    })
  })

  ipcMain.handle('sftp:disconnect', async (event, id) => {
    if (!isTrustedIpcSender(event.sender)) return IPC_UNAUTHORIZED
    const session = sftpSessions.get(id)
    if (session) {
      try { session.conn.end() } catch (e) {}
      sftpSessions.delete(id)
    }
    return { success: true }
  })

  ipcMain.handle('sftp:list', async (event, id, remotePath) => {
    if (!isTrustedIpcSender(event.sender)) return { success: false, error: IPC_UNAUTHORIZED.error }
    const session = sftpSessions.get(id)
    if (!session) return { success: false, error: 'No SFTP session' }

    return new Promise((resolve) => {
      session.sftp.readdir(remotePath, (err, list) => {  // 读取远程文件（文件夹），回调接收错误 err 和文件列表 list
        if (err) return resolve({ success: false, error: err.message })
        const items = list.map(item => ({  // list.map：将每个文件项转换为对象，包含文件名、路径、是否为目录、大小、修改时间和权限信息
          name: item.filename,
          path: remotePath === '/' ? '/' + item.filename : remotePath + '/' + item.filename,
          isDir: item.attrs.isDirectory(),
          size: item.attrs.size,
          mtime: item.attrs.mtime * 1000,
          permissions: item.attrs.mode,
        })).sort((a, b) => {  // 排序：目录优先，然后按名称排序
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        resolve({ success: true, items })
      })
    })
  })

  ipcMain.handle('sftp:download', async (event, id, remotePath, localPath) => {
    if (!isTrustedIpcSender(event.sender)) return IPC_UNAUTHORIZED
    const session = sftpSessions.get(id)
    if (!session) return { success: false, error: 'No SFTP session' }
    try {
      assertSftpLocalFilePathAllowed(localPath, '下载')
    } catch (e) {
      return { success: false, error: e.message }
    }

    return new Promise((resolve) => {
      session.sftp.fastGet(remotePath, localPath, {  // 调用 fastGet 开始下载远程文件到本地路径
        step: (transferred, _chunk, total_size) => {  // fastGet 提供的回调：下载过程中每传输一个块就会调用一次，接收已传输字节数 transferred、当前块大小 chunk 和文件总大小 total_size
          mainWindow.webContents.send('sftp:progress', id, {
            type: 'download',
            file: remotePath,
            transferred,
            total: total_size,
            percent: Math.round((transferred / total_size) * 100),
          })
        },
      }, (err) => {  // fastGet 的最终回调，下载完成或失败时调用
        if (err) return resolve({ success: false, error: err.message })
        resolve({ success: true })
      })
    })
  })

  ipcMain.handle('sftp:downloadDir', async (event, id, remoteDir, localDir) => {
    if (!isTrustedIpcSender(event.sender)) return IPC_UNAUTHORIZED
    const session = sftpSessions.get(id)
    if (!session) return { success: false, error: 'No SFTP session' }
    try {
      assertSftpLocalDirAllowed(localDir, '下载')
    } catch (e) {
      return { success: false, error: e.message }
    }
    try {
      await downloadDirRecursive(session, id, remoteDir, localDir)  // 递归下载远程服务器目录到本地目录
      return { success: true }
    } catch (e) {
      return { success: false, error: e?.message || String(e) }  // 下载失败，返回错误信息
    }
  })

  ipcMain.handle('sftp:upload', async (event, id, localPath, remotePath) => {
    if (!isTrustedIpcSender(event.sender)) return IPC_UNAUTHORIZED
    const session = sftpSessions.get(id)
    if (!session) return { success: false, error: 'No SFTP session' }
    try {
      assertSftpLocalFilePathAllowed(localPath, '上传')
    } catch (e) {
      return { success: false, error: e.message }
    }

    return new Promise((resolve) => {
      session.sftp.fastPut(localPath, remotePath, {
        step: (transferred, _chunk, total_size) => {
          mainWindow.webContents.send('sftp:progress', id, {
            type: 'upload',
            file: localPath,
            transferred,
            total: total_size,
            percent: Math.round((transferred / total_size) * 100),
          })
        },
      }, (err) => {
        if (err) return resolve({ success: false, error: err.message })
        resolve({ success: true })
      })
    })
  })

  ipcMain.handle('sftp:mkdir', async (event, id, remotePath) => {
    if (!isTrustedIpcSender(event.sender)) return IPC_UNAUTHORIZED
    const session = sftpSessions.get(id)
    if (!session) return { success: false, error: 'No SFTP session' }
    return new Promise((resolve) => {
      session.sftp.mkdir(remotePath, (err) => {
        if (err) return resolve({ success: false, error: err.message })
        resolve({ success: true })
      })
    })
  })

  ipcMain.handle('sftp:delete', async (event, id, remotePath) => {
    if (!isTrustedIpcSender(event.sender)) return IPC_UNAUTHORIZED
    const session = sftpSessions.get(id)
    if (!session) return { success: false, error: 'No SFTP session' }
    try {
      await deleteRecursive(session, remotePath)
      return { success: true }
    } catch (e) {
      return { success: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('sftp:rename', async (event, id, oldPath, newPath) => {
    if (!isTrustedIpcSender(event.sender)) return IPC_UNAUTHORIZED
    const session = sftpSessions.get(id)
    if (!session) return { success: false, error: 'No SFTP session' }
    return new Promise((resolve) => {
      session.sftp.rename(oldPath, newPath, (err) => {
        if (err) return resolve({ success: false, error: err.message })
        resolve({ success: true })
      })
    })
  })
}

export { setupSFTPHandlers }
