import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { useI18n } from '../context/I18nContext.jsx'
import { fetchSessionSecrets } from '../store/credentialsBridge.js'
import { TERMINAL_ENCODING_OPTIONS } from '../../shared/terminalEncodings.js'
import {
  PORT_MIN, PORT_MAX, BAUD_RATES, PARITIES,
  SSH_SESSION_DEFAULT, TELNET_SESSION_DEFAULT, SERIAL_SESSION_DEFAULT,
} from '../lib/session/constants.js'
import {
  mergeSessionFormDefaults, normalizeBackspaceMode, clampPortFieldString, parseSessionPort,
  buildSessionLabel, validateSessionGroupLabel, SESSION_GROUP_LABEL_ERROR_KEYS,
} from '../lib/session/utils.js'
import '../styles/dialog.css'

/**
 * 串口路径是否与 listPorts 结果一致（与主进程 serial.js 判定对齐；Windows 上对 COM 路径不区分大小写）
 * @param {string} requestedPath 请求的串口路径
 * @param {Array<{ path?: string }>} ports 枚举的串口列表
 * @returns {boolean} 是否与枚举列表一致，如果请求的串口路径为空则返回 false
 */
function isSerialPathInEnumeratedList(requestedPath, ports) {
  const req = String(requestedPath ?? '').trim()
  if (!req) return false
  const paths = (ports || []).map((p) => p?.path).filter(Boolean)
  const win = typeof process !== 'undefined' && process.platform === 'win32'
  if (win) {
    const rl = req.toLowerCase()
    return paths.some((p) => p.toLowerCase() === rl)
  }
  return paths.includes(req)
}

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
 * @param {string} [props.appBackspaceFallback] 旧版全局「退格键模式」，新建时作默认值（已迁移到按会话配置）
 */
export default function ConnectDialog({ type, initialData, savedGroups, appBackspaceFallback, onConnect, onSaveAndConnect, onSaveOnly, onClose }) {
  const { t } = useI18n()  // 国际化翻译函数
  const [tab, setTab] = useState(type || 'ssh')  // 当前协议类型
  const [form, setForm] = useState(() => mergeSessionFormDefaults(type || 'ssh', initialData, appBackspaceFallback))  // 表单数据
  const [ports, setPorts] = useState([])  // 串口列表
  const [error, setError] = useState('')  // 错误信息
  const [credDialog, setCredDialog] = useState(null)  // { username, password, privateKey, passphrase, callback } 或 null，表示是否显示凭证输入对话框以及初始值和连接回调函数
  
  /** 用户名输入框引用，用来聚焦到用户名输入框 */
  const credUserInputRef = useRef(null)
  /** 私钥输入框引用，用来聚焦到私钥输入框 */
  const credPkeyInputRef = useRef(null)
  /** 密码输入框引用，用来聚焦到密码输入框 */
  const credPassInputRef = useRef(null)
  /** 避免在凭证弹层内每次输入都重复 focus，只在本次打开时聚焦一次，用一个布尔值来记录是否已经聚焦过 */
  const credFocusAppliedRef = useRef(false)
  /** SSH / Telnet 各自上次在表单里编辑的端口；互切标签时不把对方的端口写进当前协议 */
  const portByTabRef = useRef({
    ssh: String(SSH_SESSION_DEFAULT.port),
    telnet: String(TELNET_SESSION_DEFAULT.port),
  })

  /**
   * 切换协议类型时更新表单数据。保留已有参数，补齐当前协议缺省字段，重置错误信息。
   * SSH 与 Telnet 互切时端口不跟随对方，恢复该协议上次使用的端口（首次为 22 / 23）。
   * @param {string} next 新的协议类型
   */
  const switchTab = (next) => {
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
      const merged = mergeSessionFormDefaults(next, prev, appBackspaceFallback)
      const sshTelnetSwitch = (from === 'ssh' && next === 'telnet') || (from === 'telnet' && next === 'ssh')
      if (sshTelnetSwitch) {
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
      if (res?.success) setPorts(res.ports)
      else setPorts([])
    })
  }, [])

  useEffect(() => {  // 监听 tab 变化，切换到 Serial 时枚举串口
    setError('')
    if (tab === 'serial') refreshSerialPorts()
  }, [tab, refreshSerialPorts])

  useEffect(() => {  // 编辑已保存会话时从主进程 vault 拉取敏感字段合并到表单
    let cancelled = false
    const sid = initialData?.savedId
    if (!sid) return
    void (async () => {
      const sec = await fetchSessionSecrets(sid)
      if (cancelled) return
      const t = initialData.type || type || 'ssh'
      setTab(t)
      setForm({ ...mergeSessionFormDefaults(t, initialData, appBackspaceFallback), ...sec })
    })()
    return () => { cancelled = true }
  }, [initialData?.savedId, initialData?.type, type, appBackspaceFallback])

  /** 
   * 更新表单数据的通用函数。接收一个键和值，使用 setForm 更新对应的表单字段，同时保留其他字段不变
   * @param {string} key 设置项的键
   * @param {string} value 设置项的值
   */
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

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
    if (glErr) return t(SESSION_GROUP_LABEL_ERROR_KEYS[glErr])
    return ''
  }

  /**
   * 构建配置对象，准备连接或保存。根据当前协议类型和表单数据生成一个完整的配置对象，进行必要的类型转换和默认值处理，同时生成标签名称（如果未指定标签则根据协议和主机信息生成）。该配置对象将作为连接或保存的参数传递给回调函数
   * @returns {Object} 配置对象
   */
  const buildConfig = () => ({
    ...form,
    type: tab,
    backspaceMode: normalizeBackspaceMode(form.backspaceMode) ?? 'auto',
    port: parseSessionPort(form.port),
    baudRate: parseInt(form.baudRate, 10) || SERIAL_SESSION_DEFAULT.baudRate,
    dataBits: parseInt(form.dataBits, 10) || SERIAL_SESSION_DEFAULT.dataBits,
    stopBits: parseInt(form.stopBits, 10) || SERIAL_SESSION_DEFAULT.stopBits,
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
  const needsCredentials = (config) => {
    if (config.type === 'telnet') {
      return !config.username?.trim() || !config.password?.trim()
    }
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
  const act = (fn, requireCreds = true) => {
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
            <div className="dialog-tabs">{t('connect.credTitle')}</div>
            <button className="dialog-close" onClick={() => setCredDialog(null)}>×</button>
          </div>
          <div className="dialog-body">
            <FormRow label={t('connect.username')}>
              <input
                ref={credUserInputRef}
                value={username}
                onChange={e => setCredDialog(prev => ({ ...prev, username: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && applyCred()}
              />
            </FormRow>
            {keyAuth ? (
              <>
                <FormRow label={t('connect.privateKey')}>
                  <input
                    ref={credPkeyInputRef}
                    placeholder="/path/to/id_rsa"
                    value={privateKey}
                    onChange={e => setCredDialog(prev => ({ ...prev, privateKey: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && applyCred()}
                  />
                </FormRow>
                <FormRow label={t('connect.passphrase')}>
                  <input
                    type="password"
                    placeholder={t('connect.passphrasePh')}
                    value={passphrase}
                    onChange={e => setCredDialog(prev => ({ ...prev, passphrase: e.target.value }))}
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
                  onChange={e => setCredDialog(prev => ({ ...prev, password: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && applyCred()}
                />
              </FormRow>
            )}
          </div>
          <div className="dialog-footer">
            <button className="btn-cancel" onClick={() => setCredDialog(null)}>{t('connect.cancel')}</button>
            <button className="btn-connect" onClick={applyCred}>{t('connect.connect')}</button>
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
            {['ssh', 'telnet', 'serial'].map((proto) => (
              <button key={proto} type="button" className={`dialog-tab ${tab===proto?'active':''}`} onClick={() => switchTab(proto)}>
                {proto === 'ssh' ? 'SSH' : proto === 'telnet' ? 'Telnet' : 'Serial'}
              </button>
            ))}
          </div>
          <button className="dialog-close" onClick={onClose}>×</button>
        </div>

        <div className="dialog-body">
          <FormRow label={t('connect.label')}>
            <input placeholder={t('connect.labelPh')} value={form.label} onChange={e => set('label', e.target.value)} />
          </FormRow>
          <FormRow label={t('connect.group')}>
            <input placeholder={t('connect.groupPh')} value={form.group} onChange={e => set('group', e.target.value)} list="group-list" />
            <datalist id="group-list">
              {(savedGroups||[]).map(g => <option key={g} value={g} />)}
            </datalist>
          </FormRow>
          <div className="dialog-divider" />
          <SshForm form={form} set={set} visible={tab==='ssh'} />
          <TelnetForm form={form} set={set} visible={tab==='telnet'} />
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

/**
 * SSH 表单组件。根据 form 数据渲染 SSH 连接的表单项，支持密码认证和私钥认证两种方式，根据 visible 控制是否渲染
 * @param {Object} form 表单数据
 * @param {Function} set 设置表单数据的函数
 * @param {boolean} visible 是否可见
 * @returns {JSX.Element} SSH 表单
 */
function SshForm({ form, set, visible }) {
  const { t } = useI18n()
  if (!visible) return null
  return (
    <>
      <FormRow label={t('connect.host')}>
        <input placeholder={t('connect.hostPh')} value={form.host} onChange={e => set('host', e.target.value)} autoFocus />
      </FormRow>
      <FormRow label={t('connect.port')}>
        <input type="number" min={PORT_MIN} max={PORT_MAX} value={form.port} onChange={e => set('port', clampPortFieldString(e.target.value))} style={{width:80}} />
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

/**
 * Telnet 表单组件。根据 form 数据渲染 Telnet 连接的表单项，根据 visible 控制是否渲染
 * 
 * @param {Object} form 表单数据
 * @param {Function} set 设置表单数据的函数
 * @param {boolean} visible 是否可见
 * @returns {JSX.Element} Telnet 表单
 */
function TelnetForm({ form, set, visible }) {
  const { t } = useI18n()
  if (!visible) return null
  return (
    <>
      <FormRow label={t('connect.host')}>
        <input placeholder={t('connect.hostPh')} value={form.host} onChange={e => set('host', e.target.value)} autoFocus />
      </FormRow>
      <FormRow label={t('connect.port')}>
        <input type="number" min={PORT_MIN} max={PORT_MAX} value={form.port} onChange={e => set('port', clampPortFieldString(e.target.value))} style={{width:80}} />
      </FormRow>
      <FormRow label={t('connect.username')}>
        <input placeholder={t('connect.usernamePh')} value={form.username || ''} onChange={e => set('username', e.target.value)} />
      </FormRow>
      <FormRow label={t('connect.password')}>
        <input type="password" placeholder={t('connect.passwordPh')} value={form.password || ''} onChange={e => set('password', e.target.value)} />
      </FormRow>
    </>
  )
}

/**
 * Serial 表单组件。根据 form 数据渲染串口连接的表单项，提供串口路径的输入和可用串口的选择，根据 visible 控制是否渲染
 * @param {Object} form 表单数据
 * @param {Function} set 设置表单数据的函数
 * @param {Array} ports 可用串口列表，用于 datalist 自动补全
 * @param {boolean} visible 是否可见
 * @param {Function} onRefreshPorts 重新枚举串口（路径必须与枚举结果一致方可连接）
 * @returns {JSX.Element} Serial 表单
 */
function SerialForm({ form, set, ports, visible, onRefreshPorts }) {
  const { t } = useI18n()
  if (!visible) return null
  return (
    <>
      <FormRow label={t('connect.serialPort')}>
        <input
          className="dialog-serial-path-input"
          placeholder={t('connect.serialPh')}
          value={form.path}
          onChange={e => set('path', e.target.value)}
          list="port-list"
          autoFocus
        />
        <button type="button" className="dialog-serial-refresh-btn" onClick={onRefreshPorts}>
          {t('connect.refresh')}
        </button>
        <datalist id="port-list">
          {ports.map(p => <option key={p.path} value={p.path}>{p.path}{p.manufacturer ? ` (${p.manufacturer})` : ''}</option>)}
        </datalist>
      </FormRow>
      <FormRow label={t('connect.baudRate')}>
        <select value={form.baudRate} onChange={e => set('baudRate', e.target.value)}>
          {BAUD_RATES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </FormRow>
      <FormRow label={t('connect.dataBits')}>
        <select value={form.dataBits} onChange={e => set('dataBits', e.target.value)}>
          {['5','6','7','8'].map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </FormRow>
      <FormRow label={t('connect.stopBits')}>
        <select value={form.stopBits} onChange={e => set('stopBits', e.target.value)}>
          {['1','2'].map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </FormRow>
      <FormRow label={t('connect.parity')}>
        <select value={form.parity} onChange={e => set('parity', e.target.value)}>
          {PARITIES.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </FormRow>
    </>
  )
}

/**
 * 表单行组件。用于在连接对话框中渲染标签和输入控件的行布局
 * @param {string} label 行标签
 * @param {JSX.Element} children 输入控件
 * @returns {JSX.Element} 表单行
 */
function FormRow({ label, children, title }) {
  return (
    <div className="form-row">
      <label className="form-label" title={title}>{label}</label>
      <div className="form-control">{children}</div>
    </div>
  )
}
