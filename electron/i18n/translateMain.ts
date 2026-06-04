import { translate } from '../../shared/translate.js'
import { APP } from './app.js'
import { SERIAL } from './serial.js'
import { SSH_KNOWN_HOSTS } from './sshKnownHosts.js'

/** 仅主进程原生对话框 / 终端直写等仍需主进程翻译的文案 */
const MAIN_MESSAGES = {
  zh: {
    app: APP.zh,
    serial: SERIAL.zh,
    sshKnownHosts: SSH_KNOWN_HOSTS.zh,
  },
  en: {
    app: APP.en,
    serial: SERIAL.en,
    sshKnownHosts: SSH_KNOWN_HOSTS.en,
  },
}

/** 渲染进程经 IPC 同步的语言 (仅 zh/en); 同步前默认 en) */
let storedUiLanguage = 'en'

/**
 * 设置渲染进程经 IPC 同步的语言 (仅 zh/en); 同步前默认 en)
 * @param {'zh'|'en'} value `zh` | `en`
 */
export function setStoredUiLanguage(value: 'zh' | 'en') {
  storedUiLanguage = value === 'zh' ? 'zh' : 'en'
}

/**
 * 翻译主进程文案
 * @param path 路径(如"zh.titlebar.close")
 * @param params 参数（如{name: '张三'}）
 * @returns 翻译后的文案
 */
export function translateMain(path: string, params: Record<string, string | number> = {}) {
  const L = storedUiLanguage === 'en' ? 'en' : 'zh'
  return translate(L, MAIN_MESSAGES, path, params)
}
