import fs from 'fs'
import os from 'os'
import path from 'path'
import { isPrivateKeyPemContent } from '../../shared/privateKeyMaterial.js'
import { createIpcError } from './ipcResponse.js'
import { assertLocalFilePathAllowed } from './localPathPolicy.js'

/** 
 * 展开 ~ / ~/path
 * @param input 输入字符串
 * @returns 展开后的字符串
 */
function expandHome(input: string): string {
  const s = input.trim()
  if (s === '~') return os.homedir()
  if (s.startsWith('~/') || s.startsWith('~\\')) {
    return path.join(os.homedir(), s.slice(2))
  }
  return s
}

/**
 * 将私钥输入（PEM 内容或本地文件路径）解析为 ssh2 可用的密钥字符串
 * @param raw 表单中的 privateKey 字段
 * @returns 解析后的私钥字符串
 */
export function resolvePrivateKeyMaterial(raw: unknown): string {
  const text = raw == null ? '' : String(raw)
  const trimmed = text.trim()
  if (!trimmed) return ''

  if (isPrivateKeyPemContent(trimmed)) {  // 若是 PEM 内容，则直接返回
    return trimmed
  }

  const pathCandidate = trimmed.split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? trimmed  // 若是文件路径，则解析为文件路径
  if (isPrivateKeyPemContent(pathCandidate)) {  // 若是 PEM 内容，则直接返回
    return pathCandidate
  }

  const filePath = path.resolve(expandHome(pathCandidate))  // 解析为绝对路径
  try {
    assertLocalFilePathAllowed(filePath, 'read')  // 检查路径是否允许读取
  } catch (e) {
    throw e
  }

  let stat: fs.Stats
  try {
    stat = fs.statSync(filePath)  // 获取文件状态
  } catch {
    throw createIpcError('ssh.privateKeyReadFailed', { path: pathCandidate })
  }
  if (!stat.isFile()) {  // 若不是文件，则抛出错误
    throw createIpcError('ssh.privateKeyInvalid')
  }

  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf8').trim()  // 读取文件内容
  } catch {
    throw createIpcError('ssh.privateKeyReadFailed', { path: pathCandidate })
  }

  if (!isPrivateKeyPemContent(content)) {  // 若不是 PEM 内容，则抛出错误
    throw createIpcError('ssh.privateKeyInvalid')
  }
  return content  // 返回 PEM 内容
}
