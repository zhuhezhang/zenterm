import { useI18n } from '@/context/I18nContext'
import { PORT_MIN, PORT_MAX } from '@/lib/session/defaults'
import { clampPortFieldString } from '@/lib/session/utils'
import type { SessionFormFieldsProps } from '@/types/connectDialog'
import FormRow from './FormRow'

/** SSH 表单组件；支持密码与私钥认证，visible 为 false 时不渲染。 */
export default function SshForm({ form, set, visible }: SessionFormFieldsProps) {
  const { t } = useI18n()
  if (!visible) return null
  return (
    <>
      <FormRow label={t('connect.host')}>
        <input placeholder={t('connect.hostPh')} value={form.host} onChange={e => set('host', e.target.value)} autoFocus />
      </FormRow>
      <FormRow label={t('connect.port')}>
        <input type="number" min={PORT_MIN} max={PORT_MAX} value={form.port} onChange={e => set('port', clampPortFieldString(e.target.value))} style={{ width: 80 }} />
      </FormRow>
      <FormRow label={t('connect.username')}>
        <input placeholder={t('connect.usernamePh')} value={form.username || ''} onChange={e => set('username', e.target.value)} />
      </FormRow>
      <FormRow label={t('connect.authType')}>
        <select value={form.authType} onChange={e => set('authType', e.target.value)}>
          <option value="password">{t('connect.authPassword')}</option>
          <option value="privateKey">{t('connect.authPrivateKey')}</option>
        </select>
      </FormRow>
      {form.authType === 'password' ? (
        <FormRow label={t('connect.password')}>
          <input type="password" placeholder={t('connect.passwordPh')} value={form.password || ''} onChange={e => set('password', e.target.value)} />
        </FormRow>
      ) : (
        <>
          <FormRow label={t('connect.privateKey')}>
            <input placeholder={t('connect.privateKeyPath')} value={form.privateKey} onChange={e => set('privateKey', e.target.value)} />
          </FormRow>
          <FormRow label={t('connect.passphrase')}>
            <input type="password" placeholder={t('connect.passphrasePh')} value={form.passphrase} onChange={e => set('passphrase', e.target.value)} />
          </FormRow>
        </>
      )}
      <div className="dialog-divider" />
      <FormRow label={t('connect.sftp')}>
        <label className="toggle-row">
          <input type="checkbox" checked={form.enableSftp} onChange={e => set('enableSftp', e.target.checked)} />
          <span>{t('connect.enableSftp')}</span>
        </label>
      </FormRow>
    </>
  )
}
