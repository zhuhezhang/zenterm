import { useRef, useState } from 'react'
import { useI18n } from '@/context/I18nContext'
import type { CredentialDialogProps } from '@/types/components'
import '@/styles/dialog.css'

export default function CredentialDialog({
  username,
  password,
  privateKey,
  passphrase,
  session,
  saveSecretsToVault,
  onConnect,
  onSaveAndConnect,
  onClose,
}: CredentialDialogProps) {
  const { t } = useI18n()
  const [user, setUser] = useState(username || '')
  const [pass, setPass] = useState(password || '')
  const [pkey, setPkey] = useState(privateKey || '')
  const [pphrase, setPphrase] = useState(passphrase || '')
  const userRef = useRef<HTMLInputElement>(null)
  const passRef = useRef<HTMLInputElement>(null)
  const pkeyRef = useRef<HTMLInputElement>(null)
  const keyAuth = session?.authType === 'privateKey'
  const hasUser = user?.trim()
  const hasPass = pass?.trim()
  const hasPkey = pkey?.trim()
  const autoFocusUser = !hasUser
  const canSave = !!session?.savedId
  const submitConnect = () => onConnect(user, pass, pkey, pphrase)
  const submitSaveAndConnect = () => void onSaveAndConnect(user, pass, pkey, pphrase)

  const handleEnter = (field: 'user' | 'pkey' | 'pass' | 'passphrase') => {
    const required: { id: 'user' | 'pkey' | 'pass'; ref: typeof userRef; value: string }[] = keyAuth
      ? [
          { id: 'user', ref: userRef, value: user },
          { id: 'pkey', ref: pkeyRef, value: pkey },
        ]
      : [
          { id: 'user', ref: userRef, value: user },
          { id: 'pass', ref: passRef, value: pass },
        ]

    if (field !== 'passphrase') {
      const current = required.find(item => item.id === field)
      if (current && !current.value.trim()) {
        current.ref.current?.focus()
        return
      }
    }

    const firstEmpty = required.find(item => !item.value.trim())
    if (firstEmpty) {
      firstEmpty.ref.current?.focus()
      return
    }

    if (canSave) submitSaveAndConnect()
    else submitConnect()
  }

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
                ref={userRef}
                value={user}
                autoFocus={autoFocusUser}
                onChange={e => setUser(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleEnter('user')}
              />
            </div>
          </div>
          {keyAuth ? (
            <>
              <div className="form-row">
                <label className="form-label">{t('credential.privateKeyPath')}</label>
                <div className="form-control">
                  <input
                    ref={pkeyRef}
                    placeholder="/path/to/id_rsa"
                    value={pkey}
                    autoFocus={!!hasUser && !hasPkey}
                    onChange={e => setPkey(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleEnter('pkey')}
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
                    onKeyDown={e => e.key === 'Enter' && handleEnter('passphrase')}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="form-row">
              <label className="form-label">{t('credential.password')}</label>
              <div className="form-control">
                <input
                  ref={passRef}
                  type="password"
                  value={pass}
                  autoFocus={!autoFocusUser && !hasPass}
                  onChange={e => setPass(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleEnter('pass')}
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
