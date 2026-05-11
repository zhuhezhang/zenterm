import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { useI18n } from '../context/I18nContext.jsx'
import { fetchSessionSecrets } from '../store/credentialsBridge.js'
import { TERMINAL_ENCODING_OPTIONS, DEFAULT_TERMINAL_ENCODING } from '../../shared/terminalEncodings.js'
import '../styles/dialog.css'

const SSH_DEFAULT = { host: '', port: '22', username: '', password: '', privateKey: '', passphrase: '', authType: 'password', label: '', group: '', enableSftp: false, encoding: DEFAULT_TERMINAL_ENCODING }
const TELNET_DEFAULT = { host: '', port: '23', label: '', group: '', encoding: DEFAULT_TERMINAL_ENCODING }
const SERIAL_DEFAULT = { path: '', baudRate: '9600', dataBits: '8', stopBits: '1', parity: 'none', label: '', group: '', encoding: DEFAULT_TERMINAL_ENCODING }
const BAUD_RATES = ['110','300','600','1200','2400','4800','9600','14400','19200','38400','57600','115200','128000','256000']
const PARITIES = ['none','even','odd','mark','space']

/**
 * 串口路径是否与 listPorts 结果一致（与主进程 serial.js 判定对齐；Windows 上对 COM 路径不区分大小写）
 * @param {string} requestedPath
 * @param {Array<{ path?: string }>} ports
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
 * 获取默认配置
 * 根据协议类型返回对应的默认配置对象，如果传入 initial 则在默认配置基础上覆盖初始值
 * @param {string} tab 协议类型
 * @param {Object} initial 初始配置
 * @returns {Object} 默认配置
 */
function getDefault(tab, initial) {
  const base = tab === 'ssh' ? { ...SSH_DEFAULT } : tab === 'telnet' ? { ...TELNET_DEFAULT } : { ...SERIAL_DEFAULT }
  if (initial) return { ...base, ...initial }
  return base
}

/**
 * 构建标签名称
 * 根据协议类型和配置对象生成一个标签名称，去除非法字符并保证不为空
 * @param {string} tab 协议类型
 * @param {Object} form 配置对象
 * @returns {string} 标签名称
 */
function buildLabel(tab, form) {
  if (tab === 'serial') {
    const raw = form.path || 'Serial'
    return raw.replace(/[\/\\:*?"\u003c\u003e|\x00]/g, '').trim() || 'Serial'
  }
  const raw = (form.username ? form.username + '@' : '') + (form.host || tab.toUpperCase())
  return raw.replace(/[\/\\:*?"\u003c\u003e|\x00]/g, '').trim() || tab.toUpperCase()
}

/**
 * 连接对话框组件
 * 提供 SSH、Telnet、Serial 三种连接方式的配置界面，支持保存会话和直接连接
 * @param {Object} props 组件属性
 * @param {string} props.type 初始协议类型（ssh/telnet/serial）
 * @param {Object} props.initialData 初始配置数据，用于编辑已保存会话时预填充表单
 * @param {Array} props.savedGroups 已保存的分组列表，用于分组输入的自动补全
 * @param {Function} props.onConnect 直接连接的回调函数，参数为配置对象
 * @param {Function} props.onSaveAndConnect 保存并连接的回调函数，参数为配置对象
 * @param {Function} props.onSaveOnly 仅保存的回调函数，参数为配置对象
 * @param {Function} props.onClose 关闭对话框的回调函数
 */
export default function ConnectDialog({ type, initialData, savedGroups, onConnect, onSaveAndConnect, onSaveOnly, onClose }) {
  const { t } = useI18n()
  const [tab, setTab] = useState(type || 'ssh')
  const [form, setForm] = useState(() => getDefault(type || 'ssh', initialData))
  const [ports, setPorts] = useState([])
  const [error, setError] = useState('')
  const [credDialog, setCredDialog] = useState(null)  // { username, password, callback } 或 null，表示是否显示凭证输入对话框以及初始值和连接回调函数
  const credUserInputRef = useRef(null)
  const credPkeyInputRef = useRef(null)
  const credPassInputRef = useRef(null)
  /** 避免在凭证弹层内每次输入都重复 focus，只在本次打开时聚焦一次 */
  const credFocusAppliedRef = useRef(false)

  /**
   * 切换协议类型时更新表单数据。保留已有参数，补齐当前协议缺省字段，重置错误信息
   * @param {string} t 新的协议类型
   */
  const switchTab = (t) => {
    if (t === tab) return
    setForm(prev => ({ ...prev, ...getDefault(t, prev) }))
    setTab(t)
    setError('')
  }

  // 刷新串口列表，用于串口连接时选择串口设备
  const refreshSerialPorts = useCallback(() => {
    window.zterm?.serial.listPorts().then((res) => {
      if (res?.success) setPorts(res.ports)
      else setPorts([])
    })
  }, [])

  // 监听 tab：切换到 Serial 时枚举串口
  useEffect(() => {
    setError('')
    if (tab === 'serial') refreshSerialPorts()
  }, [tab, refreshSerialPorts])

  /** 编辑已保存会话时从主进程 vault 拉取敏感字段合并到表单 */
  useEffect(() => {
    let cancelled = false
    const sid = initialData?.savedId
    if (!sid) return
    void (async () => {
      const sec = await fetchSessionSecrets(sid)
      if (cancelled) return
      const t = initialData.type || type || 'ssh'
      setTab(t)
      setForm({ ...getDefault(t, initialData), ...sec })
    })()
    return () => { cancelled = true }
  }, [initialData?.savedId, initialData?.type, type])

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
    if (form.group?.startsWith('/')) return t('connect.errGroupSlashStart')
    if (form.group?.endsWith('/')) return t('connect.errGroupSlashEnd')
    if (form.group && /[\\:*?"\u003c\u003e|\x00]/.test(form.group)) return t('connect.errGroupChars')
    if (form.label && /[\/\\:*?"\u003c\u003e|\x00]/.test(form.label)) return t('connect.errLabelChars')
    return ''
  }

  /**
   * 构建配置对象，准备连接或保存。根据当前协议类型和表单数据生成一个完整的配置对象，进行必要的类型转换和默认值处理，同时生成标签名称（如果未指定标签则根据协议和主机信息生成）。该配置对象将作为连接或保存的参数传递给回调函数
   * @returns {Object} 配置对象
   */
  const buildConfig = () => ({
    ...form, type: tab,
    port: parseInt(form.port) || undefined,
    baudRate: parseInt(form.baudRate) || 9600,
    dataBits: parseInt(form.dataBits) || 8,
    stopBits: parseInt(form.stopBits) || 1,
    label: form.label?.trim() || buildLabel(tab, form),
  })

  /** 凭证弹层内 HTML autoFocus 易被关闭按钮等抢占；打开时在 layout 阶段 + 下一帧主动 focus 一次 */
  useLayoutEffect(() => {  // useLayoutEffect 在 DOM 渲染后执行，不会阻塞主线程，不会影响用户体验
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
    const id = requestAnimationFrame(run)  // requestAnimationFrame 让回调函数在下一帧执行，是异步的，不会阻塞主线程，不会影响用户体验
    return () => cancelAnimationFrame(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 每轮弹层只聚焦一次；打开时读取当时 form/tab（同 buildConfig）
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
        <input type="number" value={form.port} onChange={e => set('port', e.target.value)} style={{width:80}} />
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
        <input type="number" value={form.port} onChange={e => set('port', e.target.value)} style={{width:80}} />
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
function FormRow({ label, children }) {
  return (
    <div className="form-row">
      <label className="form-label">{label}</label>
      <div className="form-control">{children}</div>
    </div>
  )
}
