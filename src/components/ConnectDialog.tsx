import { useState, useEffect, useCallback, useRef, useLayoutEffect, memo } from 'react'
import { useI18n } from '../context/I18nContext'
import { ipcPortsFromResponse } from '@/lib/ipc/ipcResponse'
import { fetchSessionSecrets } from '../store/credentialsBridge'
import { DEFAULT_TERMINAL_ENCODING, TERMINAL_ENCODING_OPTIONS } from '../lib/terminalEncodingService'
import {
  SESSION_GROUP_LABEL_ERROR_KEYS,
  SSH_SESSION_DEFAULT, TELNET_SESSION_DEFAULT, SERIAL_SESSION_DEFAULT,
} from '../lib/session/defaults'
import {
  mergeSessionFormDefaults, normalizeBackspaceMode, clampPortFieldString, parseSessionPort,
  buildSessionLabel, validateSessionGroupLabel,
} from '../lib/session/utils'
import FormRow from './connect/FormRow'
import SshForm from './connect/SshForm'
import TelnetForm from './connect/TelnetForm'
import SerialForm from './connect/SerialForm'
import { isSerialPathInEnumeratedList } from '../../shared/isSerialPathInEnumeratedList'
import type { ConnectDialogProps } from '../types/components'
import type { ConnectCredDialogState } from '../types/connectDialog'
import type { SessionConfig, SessionFormValues, SessionType } from '../types/session'
import '../styles/dialog.css'

/**
 * 连接对话框组件：提供 SSH、Telnet、Serial 三种连接方式的配置界面，支持保存会话和直接连接
 * @param {Object} props 组件属性
 * @param {string} props.type 初始协议类型（ssh/telnet/serial）
 * @param {Object} props.initialData 初始配置数据，用于编辑已保存会话时预填充表单
 * @param {Array} props.savedGroups 已保存的分组列表，用于分组输入的自动补全
 * @param {Function} props.onConnect 直接连接的回调函数，参数为配置对象
 * @param {Function} props.onSaveAndConnect 保存并连接的回调函数，参数为配置对象
 * @param {Function} props.onSaveOnly 仅保存的回调函数，参数为配置对象
 * @param {Function} props.onClose 关闭对话框的回调函数
 */
function ConnectDialog({
  type,
  initialData,
  savedGroups,
  onConnect,
  onSaveAndConnect,
  onSaveOnly,
  onClose,
}: ConnectDialogProps) {
  const { t } = useI18n()
  const [tab, setTab] = useState<SessionType>(type || 'ssh')
  const [form, setForm] = useState<SessionFormValues>(() =>
    mergeSessionFormDefaults(type || 'ssh', initialData ?? undefined),
  )
  const [ports, setPorts] = useState<{ path?: string }[]>([])
  const [error, setError] = useState('')
  const [credDialog, setCredDialog] = useState<ConnectCredDialogState | null>(null)

  const credUserInputRef = useRef<HTMLInputElement | null>(null)
  const credPkeyInputRef = useRef<HTMLInputElement | null>(null)
  const credPassInputRef = useRef<HTMLInputElement | null>(null)
  const credFocusAppliedRef = useRef(false)
  const portByTabRef = useRef<{ ssh: string; telnet: string }>({ ssh: '', telnet: '' })
  if (!portByTabRef.current.ssh) {
    const initialTab = type || 'ssh'
    const initialForm = mergeSessionFormDefaults(initialTab, initialData ?? undefined)
    const toRefPort = (tabKey: SessionType, raw: unknown) => {
      const fallback = tabKey === 'ssh' ? SSH_SESSION_DEFAULT.port : TELNET_SESSION_DEFAULT.port
      const s = String(raw ?? '').trim()
      return s === '' ? String(fallback) : clampPortFieldString(s) || String(fallback)
    }
    portByTabRef.current = {
      ssh: initialTab === 'ssh' ? toRefPort('ssh', initialForm.port) : String(SSH_SESSION_DEFAULT.port),
      telnet: initialTab === 'telnet' ? toRefPort('telnet', initialForm.port) : String(TELNET_SESSION_DEFAULT.port),
    }
  }

  /**
   * 切换协议类型时更新表单数据。保留已有参数，补齐当前协议缺省字段，重置错误信息。
   * SSH 与 Telnet 互切时端口不跟随对方，恢复该协议上次使用的端口（首次为 22 / 23）。
   * @param {string} next 新的协议类型
   */
  const switchTab = (next: SessionType) => {
    if (next === tab) return
    const from = tab
    setForm((prev) => {
      if (from === 'ssh') {
        const s = String(prev.port ?? '').trim()
        portByTabRef.current.ssh = s === '' ? String(SSH_SESSION_DEFAULT.port) : clampPortFieldString(s) || String(SSH_SESSION_DEFAULT.port)
      }
      if (from === 'telnet') {
        const s = String(prev.port ?? '').trim()
        portByTabRef.current.telnet = s === '' ? String(TELNET_SESSION_DEFAULT.port) : clampPortFieldString(s) || String(TELNET_SESSION_DEFAULT.port)
      }
      const merged = mergeSessionFormDefaults(next, prev)
      if (next === 'ssh' || next === 'telnet') {
        const p = next === 'ssh' ? portByTabRef.current.ssh : portByTabRef.current.telnet
        return { ...merged, port: p }
      }
      return merged
    })
    setTab(next)
    setError('')
  }

  /** 刷新串口列表，用于串口连接时选择串口设备 */
  const refreshSerialPorts = useCallback(() => {  // useCallback: 记忆化回调函数，避免重复创建回调函数，提高性能。当依赖项变化时，回调函数会被重新创建并记忆化
    window.zterm?.serial.listPorts().then((res) => {
      setPorts(ipcPortsFromResponse(res) as { path?: string }[])
    })
  }, [])

  useEffect(() => {  // 监听 tab 变化，切换到 Serial 时枚举串口
    setError('')
    if (tab === 'serial') refreshSerialPorts()
  }, [tab, refreshSerialPorts])

  useEffect(() => {  // 编辑已保存 SSH 会话时从 vault 拉取敏感字段合并到表单
    let cancelled = false
    const sid = initialData?.savedId
    if (!sid) return
    void (async () => {
      const sessionType = initialData.type || type || 'ssh'
      const sec = sessionType === 'telnet' ? {} : await fetchSessionSecrets(sid)
      if (cancelled) return
      const merged: SessionFormValues = {
        ...mergeSessionFormDefaults(sessionType, initialData ?? undefined),
        ...sec,
      }
      if (sessionType === 'ssh' || sessionType === 'telnet') {
        const s = String(merged.port ?? '').trim()
        const fallback = sessionType === 'ssh' ? SSH_SESSION_DEFAULT.port : TELNET_SESSION_DEFAULT.port
        portByTabRef.current[sessionType] = s === '' ? String(fallback) : clampPortFieldString(s) || String(fallback)
      }
      setTab(sessionType)
      setForm(merged)
    })()
    return () => { cancelled = true }
  }, [initialData?.savedId, initialData?.type, type])

  /** 
   * 更新表单数据的通用函数。接收一个键和值，使用 setForm 更新对应的表单字段，同时保留其他字段不变
   * @param {string} key 设置项的键
   * @param {string} value 设置项的值
   */
  const set = <K extends keyof SessionFormValues>(k: K, v: SessionFormValues[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }))

  /**
   * 表单验证函数。根据当前协议类型和表单数据检查必填项是否填写，分组和标签是否包含非法字符，返回错误信息字符串
   * @returns {string} 错误信息，如果没有错误则返回空字符串
   */
  const validate = () => {
    if (tab === 'ssh' && !form.host?.trim()) return t('connect.errHost')
    if (tab === 'telnet' && !form.host?.trim()) return t('connect.errHost')
    if (tab === 'serial') {
      if (!form.path?.trim()) return t('connect.errSerial')
      if (!isSerialPathInEnumeratedList(form.path, ports)) {
        return t('connect.errSerialList')
      }
    }
    const glErr = validateSessionGroupLabel(form.group, form.label)
    if (glErr) return t(SESSION_GROUP_LABEL_ERROR_KEYS[glErr]) // 根据错误码获取错误信息
    return ''
  }

  /**
   * 构建配置对象，准备连接或保存。根据当前协议类型和表单数据生成一个完整的配置对象，进行必要的类型转换和默认值处理，同时生成标签名称（如果未指定标签则根据协议和主机信息生成）。该配置对象将作为连接或保存的参数传递给回调函数
   * @returns {Object} 配置对象
   */
  const buildConfig = (): SessionConfig => ({
    ...form,
    type: tab,
    backspaceMode: normalizeBackspaceMode(form.backspaceMode) ?? 'auto',
    port: parseSessionPort(form.port),
    baudRate: parseInt(String(form.baudRate ?? ''), 10) || SERIAL_SESSION_DEFAULT.baudRate,
    dataBits: parseInt(String(form.dataBits ?? ''), 10) || SERIAL_SESSION_DEFAULT.dataBits,
    stopBits: parseInt(String(form.stopBits ?? ''), 10) || SERIAL_SESSION_DEFAULT.stopBits,
    label: form.label?.trim() || buildSessionLabel(tab, form),
  })

  useLayoutEffect(() => {  // 凭证弹层内 HTML autoFocus 易被关闭按钮等抢占；打开时在 layout 阶段 + 下一帧主动 focus 一次（useLayoutEffect 在 DOM 渲染后执行，不会阻塞主线程，不会影响用户体验）
    if (!credDialog) {
      credFocusAppliedRef.current = false
      return
    }
    if (credFocusAppliedRef.current) return
    credFocusAppliedRef.current = true

    const cfg = buildConfig()
    const keyAuth = cfg.type === 'ssh' && cfg.authType === 'privateKey'
    const u = credDialog.username?.trim()
    const hasPkey = credDialog.privateKey?.trim()
    const hasPwd = credDialog.password?.trim()

    let el
    if (!u) el = credUserInputRef.current  // 如果用户名为空，则聚焦到用户名输入框
    else if (keyAuth && !hasPkey) el = credPkeyInputRef.current
    else if (!keyAuth && !hasPwd) el = credPassInputRef.current
    else el = credUserInputRef.current

    const run = () => { // 在凭证弹层内每次输入都重复 focus，只在本次打开时聚焦一次
      el?.focus()
      if (el === credUserInputRef.current && !u) el?.select?.()
    }
    run()
    const id = requestAnimationFrame(run)  // requestAnimationFrame 让回调函数在下一帧执行（是异步的，不会阻塞主线程，不会影响用户体验）
    return () => cancelAnimationFrame(id)
  }, [credDialog])

  /**
   * 检查是否需要输入凭证（用户名或密码为空）
   * @param {Object} config 配置对象
   * @returns {boolean} 是否需要输入凭证
   */
  const needsCredentials = (config: SessionConfig) => {
    if (config.type === 'telnet') return false
    if (config.type === 'ssh') {
      if (!config.username?.trim()) return true
      if (config.authType === 'privateKey') return !config.privateKey?.trim()
      return !config.password?.trim()
    }
    return false
  }

  /**
   * 连接/保存操作的统一处理函数
   * 根据当前表单数据构建配置对象，进行表单验证，如果需要输入凭证则弹出凭证对话框，否则直接调用回调函数
   * @param {Function} fn 连接或保存的回调函数，参数为配置对象
   * @param {boolean} requireCreds 是否需要检查凭证（用户名和密码），默认为 true
   */
  const act = (fn: (config: SessionConfig) => void, requireCreds = true) => {
    const e = validate()
    if (e) return setError(e)
    const config = buildConfig()

    if (requireCreds && needsCredentials(config)) {  // 只有在 requireCreds=true 时才检查凭证（保存会话时不检查）
      setCredDialog({
        username: config.username || '',
        password: config.password || '',
        privateKey: config.privateKey || '',
        passphrase: config.passphrase || '',
        callback: fn,
      })
      return  // 当在ssh或telnet连接界面不输入用户名连接时，由于上面setCredDialog会触发重新渲染，此时credDialog不再是null，就会渲染输入凭证组件。
    }
    fn(config)
  }

  if (credDialog) {  // 如果 credDialog 不为 null，则渲染凭证输入对话框，传入初始用户名、密码和连接回调函数
    const { username, password, privateKey, passphrase, callback } = credDialog
    const cfg = buildConfig()
    const keyAuth = cfg.type === 'ssh' && cfg.authType === 'privateKey'
    /**
     * 应用凭证函数。根据当前协议类型和表单数据生成一个完整的配置对象，进行必要的类型转换和默认值处理，
     * 同时生成标签名称（如果未指定标签则根据协议和主机信息生成）。该配置对象将作为连接或保存的参数传递给回调函数，然后关闭凭证输入对话框
     * @returns {Object} 配置对象
     */
    const applyCred = () => {
      const config = keyAuth
        ? { ...buildConfig(), username, privateKey, passphrase }
        : { ...buildConfig(), username, password }
      setCredDialog(null)
      callback(config)
    }

    return (
      <div className="dialog-overlay" onClick={e => e.target === e.currentTarget && setCredDialog(null)}>
        <div className="dialog">
          <div className="dialog-header">
            <div className="dialog-tabs">{t('credential.title')}</div>
            <button className="dialog-close" onClick={() => setCredDialog(null)}>×</button>
          </div>
          <div className="dialog-body">
            <FormRow label={t('connect.username')}>
              <input
                ref={credUserInputRef}
                value={username}
                onChange={e => setCredDialog(prev => prev ? { ...prev, username: e.target.value } : null)}
                onKeyDown={e => e.key === 'Enter' && applyCred()}
              />
            </FormRow>
            {keyAuth ? (
              <>
                <FormRow label={t('connect.privateKey')}>
                  <input
                    ref={credPkeyInputRef}
                    placeholder={t('connect.privateKeyPath')}
                    value={privateKey}
                    onChange={e => setCredDialog(prev => prev ? { ...prev, privateKey: e.target.value } : null)}
                    onKeyDown={e => e.key === 'Enter' && applyCred()}
                  />
                </FormRow>
                <FormRow label={t('connect.passphrase')}>
                  <input
                    type="password"
                    placeholder={t('connect.passphrasePh')}
                    value={passphrase}
                    onChange={e => setCredDialog(prev => prev ? { ...prev, passphrase: e.target.value } : null)}
                    onKeyDown={e => e.key === 'Enter' && applyCred()}
                  />
                </FormRow>
              </>
            ) : (
              <FormRow label={t('connect.password')}>
                <input
                  ref={credPassInputRef}
                  type="password"
                  value={password}
                  onChange={e => setCredDialog(prev => prev ? { ...prev, password: e.target.value } : null)}
                  onKeyDown={e => e.key === 'Enter' && applyCred()}
                />
              </FormRow>
            )}
          </div>
          <div className="dialog-footer">
            <button className="btn-cancel" onClick={() => setCredDialog(null)}>{t('credential.cancel')}</button>
            <button className="btn-connect" onClick={applyCred}>{t('credential.connect')}</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dialog-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dialog">
        <div className="dialog-header">
          <div className="dialog-tabs">
            {(['ssh', 'telnet', 'serial'] as const).map((proto) => (
              <button key={proto} type="button" className={`dialog-tab ${tab === proto ? 'active' : ''}`} onClick={() => switchTab(proto)}>
                {proto === 'ssh' ? 'SSH' : proto === 'telnet' ? 'Telnet' : 'Serial'}
              </button>
            ))}
          </div>
          <button className="dialog-close" onClick={onClose}>×</button>
        </div>

        <div className="dialog-body">
          <FormRow label={t('connect.label')}>
            <input placeholder={t('connect.labelPh')} value={form.label ?? ''} onChange={e => set('label', e.target.value)} />
          </FormRow>
          <FormRow label={t('connect.group')}>
            <input placeholder={t('connect.groupPh')} value={form.group ?? ''} onChange={e => set('group', e.target.value)} list="group-list" />
            <datalist id="group-list">
              {(savedGroups || []).map(g => <option key={g} value={g} />)}
            </datalist>
          </FormRow>
          <div className="dialog-divider" />
          <SshForm form={form} set={set} visible={tab === 'ssh'} />
          <TelnetForm form={form} set={set} visible={tab === 'telnet'} />
          <SerialForm form={form} set={set} ports={ports} visible={tab === 'serial'} onRefreshPorts={refreshSerialPorts} />
          <FormRow label={t('connect.encoding')}>
            <select value={form.encoding || DEFAULT_TERMINAL_ENCODING} onChange={e => set('encoding', e.target.value)}>
              {TERMINAL_ENCODING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FormRow>
          <FormRow label={t('connect.backspaceMode')} title={t('connect.backspaceModeHint')}>
            <select value={form.backspaceMode || 'auto'} onChange={e => set('backspaceMode', e.target.value)}>
              <option value="auto">{t('settings.options.backspaceAuto')}</option>
              <option value="del">{t('settings.options.backspaceDel')}</option>
              <option value="bs">{t('settings.options.backspaceBs')}</option>
            </select>
          </FormRow>
          {error && <div className="dialog-error">{error}</div>}
        </div>

        <div className="dialog-footer">
          <button className="btn-cancel" onClick={onClose}>{t('connect.cancel')}</button>
          <button className="btn-save" onClick={() => act(onSaveOnly, false)}>{t('connect.save')}</button>
          <button className="btn-connect" onClick={() => act(onConnect, true)}>{t('connect.connectDirect')}</button>
          <button className="btn-save-connect" onClick={() => act(onSaveAndConnect, true)}>{t('connect.saveAndConnect')}</button>
        </div>
      </div>
    </div>
  )
}

export default memo(ConnectDialog)
