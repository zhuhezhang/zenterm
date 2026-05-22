import { useState } from 'react'
import { useI18n } from '@/context/I18nContext.jsx'

/**
 * 连接已保存会话时补充缺失的认证信息（用户名、密码或私钥路径等）
 * @param {Object} props 组件属性
 * @param {string} props.username 用户名
 * @param {string} props.password 密码
 * @param {string} props.privateKey 私钥路径
 * @param {string} props.passphrase 私钥密码短语
 * @param {Object} props.session 会话配置对象 { type, host, port, username, password, privateKey, passphrase, savedId, group, output }
 * @param {boolean} props.saveSecretsToVault 设置中是否开启「保存敏感凭据到加密存储」
 * @param {Function} props.onConnect 仅连接，不把本次输入的敏感信息写入加密库
 * @param {Function} props.onSaveAndConnect 更新已保存会话并连接；仅当 saveSecretsToVault 为 true 时由上层把敏感信息写入 vault
 * @param {Function} props.onClose 关闭对话框
 */
export default function CredentialDialog({
  username, password, privateKey, passphrase, session, saveSecretsToVault,
  onConnect, onSaveAndConnect, onClose,
}) {
  const { t } = useI18n()
  const [user, setUser] = useState(username || '')
  const [pass, setPass] = useState(password || '')
  const [pkey, setPkey] = useState(privateKey || '')
  const [pphrase, setPphrase] = useState(passphrase || '')
  const keyAuth = session?.authType === 'privateKey'
  const hasUser = user?.trim()
  const hasPass = pass?.trim()
  const hasPkey = pkey?.trim()
  const autoFocusUser = !hasUser
  const canSave = !!session?.savedId
  const submitConnect = () => onConnect(user, pass, pkey, pphrase)
  const submitSaveAndConnect = () => void onSaveAndConnect(user, pass, pkey, pphrase)

  return (
    <div className="dialog-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dialog">
        <div className="dialog-header">
          <div className="dialog-tabs">{t('credential.title')}</div>
          <button className="dialog-close" onClick={onClose}>×</button>
        </div>
        <div className="dialog-body">
          <div className="form-row">
            <label className="form-label">{t('credential.username')}</label>
            <div className="form-control">
              <input
                placeholder={t('credential.usernamePh')}
                value={user}
                autoFocus={autoFocusUser}
                onChange={e => setUser(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitSaveAndConnect()}
              />
            </div>
          </div>
          {keyAuth ? (
            <>
              <div className="form-row">
                <label className="form-label">{t('credential.privateKeyPath')}</label>
                <div className="form-control">
                  <input
                    placeholder="/path/to/id_rsa"
                    value={pkey}
                    autoFocus={hasUser && !hasPkey}
                    onChange={e => setPkey(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitSaveAndConnect()}
                  />
                </div>
              </div>
              <div className="form-row">
                <label className="form-label">{t('credential.keyPassphrase')}</label>
                <div className="form-control">
                  <input
                    type="password"
                    placeholder={t('credential.optional')}
                    value={pphrase}
                    onChange={e => setPphrase(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitSaveAndConnect()}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="form-row">
              <label className="form-label">{t('credential.password')}</label>
              <div className="form-control">
                <input
                  type="password"
                  placeholder={t('credential.passwordPh')}
                  value={pass}
                  autoFocus={!autoFocusUser && !hasPass}
                  onChange={e => setPass(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitSaveAndConnect()}
                />
              </div>
            </div>
          )}
          {canSave && (
            <p className="cred-dialog-hint">
              {saveSecretsToVault ? t('credential.hintSaveOn') : t('credential.hintSaveOff')}
            </p>
          )}
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn-cancel" onClick={onClose}>{t('credential.cancel')}</button>
          <button type="button" className="btn-connect" onClick={submitConnect}>{t('credential.connect')}</button>
          <button type="button" className="btn-save-connect" disabled={!canSave} onClick={submitSaveAndConnect} title={canSave ? '' : t('credential.notSavedSession')}>{t('credential.saveConnect')}</button>
        </div>
      </div>
    </div>
  )
}
