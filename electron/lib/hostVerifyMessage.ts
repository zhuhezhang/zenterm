import type { Worker } from 'worker_threads'
import { verifySshHostKeyTrust } from './sshKnownHosts.js'
import type { MainWindowGetter } from '../types/handlers.js'

type HostVerifyMessage = {
  type: 'HOST_VERIFY'
  reqId: number
  host?: string
  port: number
  keyBase64: string
}

/**
 * Worker HOST_VERIFY 消息：主进程弹框校验主机密钥并回传结果。
 * ssh2 的 hostVerifier 在 Worker 里，但弹框必须在主进程（要 dialog 和 BrowserWindow）。
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
