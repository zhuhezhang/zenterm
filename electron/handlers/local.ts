/**
 * 本机交互式 Shell（node-pty）IPC handlers
 */
import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import type { IPty } from 'node-pty'
import { isTrustedIpcSender } from '../lib/trustedSender.js'
import { sendToRenderer } from '../lib/mainWindowSend.js'
import { bufferToBinaryWire, encodeOutgoingTerminalData } from '../lib/terminalEncodingService.js'
import { ipcFail, ipcFailFromThrown, ipcOk } from '../lib/ipcResponse.js'
import {
  clampPtyDim,
  resolveCwd,
  resolveShell,
  shellSpawnArgs,
} from '../lib/localShellResolve.js'
import type { MainWindowGetter } from '../types/handlers.js'
import type { LocalConnectConfig } from '../../shared/zenterm-api.js'

/** node-pty 模块（动态加载，缺失时降级） */
type NodePtyModule = typeof import('node-pty')

let nodePty: NodePtyModule | undefined
try {
  nodePty = await import('node-pty')
} catch (e) {
  console.warn('node-pty not available:', e instanceof Error ? e.message : e)
}

/** 存储所有 Local 会话，键为会话 ID */
const localSessions = new Map<string, IPty>()

/**
 * 断开并清理指定本机 Shell 会话
 * @param id 会话 ID
 */
function killLocalSession(id: string) {
  const pty = localSessions.get(id)
  if (!pty) return
  localSessions.delete(id)
  try {
    pty.kill()
  } catch {
    /* 进程可能已退出 */
  }
}

/**
 * 设置 Local Shell 相关的 IPC 处理函数
 * @param ipcMain IPC 主进程
 * @param getMainWindow 获取主窗口
 */
function setupLocalHandlers(ipcMain: IpcMain, getMainWindow: MainWindowGetter) {
  ipcMain.handle('local:connect', async (event: IpcMainInvokeEvent, id: string, config: LocalConnectConfig) => {
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    if (!nodePty) return ipcFail('local.moduleUnavailable', true)

    killLocalSession(id)

    let shell: string
    let cwd: string
    try {
      shell = resolveShell(String(config?.shell ?? ''))
      cwd = resolveCwd(String(config?.cwd ?? ''))
    } catch (e) {
      return ipcFailFromThrown(e)
    }

    const cols = clampPtyDim(config?.cols, 80)
    const rows = clampPtyDim(config?.rows, 24)
    const args = shellSpawnArgs(shell)

    let pty: IPty
    try {
      pty = nodePty.spawn(shell, args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        },
      })
    } catch (e) {
      return ipcFail(e instanceof Error ? e.message : String(e), false)
    }

    localSessions.set(id, pty)

    pty.onData((data: string) => {  // 监听来自本机的数据事件
      sendToRenderer(getMainWindow, 'local:output', id, bufferToBinaryWire(Buffer.from(data, 'utf8')))
    })

    pty.onExit(() => {  // 监听来自本机的退出事件
      localSessions.delete(id)
      sendToRenderer(getMainWindow, 'local:closed', id)
    })

    return ipcOk()
  })

  ipcMain.on('local:data', (event: IpcMainEvent, id: string, data: string, encoding?: string) => {  // 监听来自前端的本地数据事件
    if (!isTrustedIpcSender(event.sender)) return
    const pty = localSessions.get(id)
    if (!pty) return
    try {
      const buf = encodeOutgoingTerminalData(data, encoding)
      pty.write(buf.toString('binary'))
    } catch {
      /* 写入失败忽略 */
    }
  })

  ipcMain.on('local:resize', (event: IpcMainEvent, id: string, cols: number, rows: number) => {  // 监听来自前端的本地调整大小事件
    if (!isTrustedIpcSender(event.sender)) return
    const pty = localSessions.get(id)
    if (!pty) return
    try {
      pty.resize(clampPtyDim(cols, 80), clampPtyDim(rows, 24))
    } catch {
      /* resize 失败忽略 */
    }
  })

  ipcMain.handle('local:disconnect', async (event: IpcMainInvokeEvent, id: string) => {  // 监听来自前端的本地断开连接事件
    if (!isTrustedIpcSender(event.sender)) return ipcFail('app.unauthorized', true)
    killLocalSession(id)
    return ipcOk()
  })
}

export { setupLocalHandlers }
