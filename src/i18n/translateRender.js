import { translate } from '../../shared/translate.js'
import { APP, CREDENTIALS } from './components/App.js'
import { CONNECT, CREDENTIAL } from './components/ConnectDialog.js'
import { SETTINGS } from './components/SettingsDialog.js'
import { SFTP } from './components/SftpPanel.js'
import { TABBAR } from './components/TabBar.js'
import { TERMINAL } from './components/TerminalPanel.js'
import { TITLEBAR } from './components/TitleBar.js'
import { WELCOME } from './components/app/WelcomeScreen.js'
import { SIDEBAR } from './components/sidebar/Sidebar.js'
import { SSH, TELNET, SERIAL } from './ipcErrors.js'

/** 聚合各模块文案；键路径如 settings.title */
const RENDER_MESSAGES = {
  zh: {
    app: APP.zh,
    connect: CONNECT.zh,
    credential: CREDENTIAL.zh,
    credentials: CREDENTIALS.zh,
    serial: SERIAL.zh,
    ssh: SSH.zh,
    telnet: TELNET.zh,
    settings: SETTINGS.zh,
    sftp: SFTP.zh,
    sidebar: SIDEBAR.zh,
    tabbar: TABBAR.zh,
    terminal: TERMINAL.zh,
    titlebar: TITLEBAR.zh,
    welcome: WELCOME.zh,
  },
  en: {
    app: APP.en,
    connect: CONNECT.en,
    credential: CREDENTIAL.en,
    credentials: CREDENTIALS.en,
    serial: SERIAL.en,
    ssh: SSH.en,
    telnet: TELNET.en,
    settings: SETTINGS.en,
    sftp: SFTP.en,
    sidebar: SIDEBAR.en,
    tabbar: TABBAR.en,
    terminal: TERMINAL.en,
    titlebar: TITLEBAR.en,
    welcome: WELCOME.en,
  },
}

/**
 * 翻译文案，根据语言和路径获取翻译后的文案
 * @param {'zh'|'en'} lang 语言
 * @param {string} path 路径(如"zh.titlebar.close")
 * @param {Record<string, string|number>} [params] 参数（如{name: '张三'}）
 * @returns {string} 翻译后的文案
 */
export function translateRender(lang, path, params = {}) {
  const L = lang === 'en' ? 'en' : 'zh'
  return translate(L, RENDER_MESSAGES, path, params)
}
