import { resolveEffectiveUiLanguage } from '../../shared/resolveUiLanguage.js'
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

/**
 * 存放由渲染进程传过来的语言参数
 * @type {'auto'|'zh'|'en'}
 */
let storedUiLanguage = 'auto'

/** 主进程系统语言（app.whenReady 时由 main.js 写入） */
let mainSystemLang = 'en'

export function setStoredUiLanguage(value) {
  const v = String(value ?? 'auto')
  storedUiLanguage = (v === 'zh' || v === 'en' || v === 'auto') ? v : 'auto'
}

export function getStoredUiLanguage() {
  return storedUiLanguage
}

export function setMainSystemUiLang(lang) {
  mainSystemLang = lang === 'zh' ? 'zh' : 'en'
}

/** 主进程本地 UI（系统对话框等）；IPC 错误码由渲染进程翻译 */
export function translateMain(path, params = {}) {
  const L = resolveEffectiveUiLanguage(storedUiLanguage, mainSystemLang) === 'en' ? 'en' : 'zh'
  return translate(L, MAIN_MESSAGES, path, params)
}
