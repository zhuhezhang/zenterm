import type { Worker } from 'worker_threads'
import { verifySshHostKeyTrust } from './sshKnownHosts.js'
import type { MainWindowGetter } from '../types/handlers.js'

/** 主机公钥校验消息 */
type HostVerifyMessage = {
  /** 消息类型 */
  type: 'HOST_VERIFY'
  /** 请求 ID */
  reqId: number
  /** 主机名 */
  host?: string
  /** 端口 */
  port: number
  /** 主机公钥 Base64 编码 */
  keyBase64: string
}

/**
 * Worker HOST_VERIFY 消息：主进程弹框校验主机密钥并回传结果。
 * ssh2 的 hostVerifier 在 Worker 里，但弹框必须在主进程（要 dialog 和 BrowserWindow）
 * @param getMainWindow 获取主窗口实例
 * @param worker Worker 实例
 * @param msg 主机公钥校验消息
 * @returns 异步返回结果
 */
export async function handleHostVerifyMessage(
  getMainWindow: MainWindowGetter,
  worker: Worker,
  msg: HostVerifyMessage,
) {
  const raw = Buffer.from(String(msg.keyBase64), 'base64')
  const ok = await verifySshHostKeyTrust(
    getMainWindow() ?? undefined,
    String(msg.host),
    Number(msg.port) || 22,
    raw,
  )
  try {
    worker.postMessage({ type: 'HOST_VERIFY_RESULT', reqId: msg.reqId, ok })
  } catch {}
}
