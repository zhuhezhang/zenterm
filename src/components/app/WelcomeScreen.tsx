import { useI18n } from '@/context/I18nContext'
import ConnectionTypeIcon from '../common'

/**
 * 欢迎界面组件
 * 显示在没有打开任何会话时，提供新建会话的入口
 * @param {Function} onNewSession 新建会话的回调函数
 */
export default function WelcomeScreen({ onNewSession }) {
  const { t } = useI18n()
  return (
    <div className="welcome">
      <div className="welcome-logo">
        <span className="welcome-title">ZTerm</span>
        <span className="welcome-sub">{t('welcome.subtitle')}</span>
      </div>
      <div className="welcome-actions">
        {[{type:'ssh',icon:ConnectionTypeIcon.ssh,label:'SSH',desc:t('welcome.sshDesc')},
          {type:'telnet',icon:ConnectionTypeIcon.telnet,label:'Telnet',desc:t('welcome.telnetDesc')},
          {type:'serial',icon:ConnectionTypeIcon.serial,label:'Serial',desc:t('welcome.serialDesc')}].map(b => (
          <button key={b.type} className="welcome-btn" onClick={() => onNewSession(b.type)}>
            <span className="welcome-btn-icon">{b.icon}</span>
            <span className="welcome-btn-label">{b.label}</span>
            <span className="welcome-btn-desc">{b.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
