import { useState, useEffect, useCallback } from 'react'
import { fetchSessionSecrets } from '../store/credentialsBridge.js'
import '../styles/dialog.css'

const SSH_DEFAULT = { host: '', port: '22', username: '', password: '', privateKey: '', passphrase: '', authType: 'password', label: '', group: '', enableSftp: false }
const TELNET_DEFAULT = { host: '', port: '23', label: '', group: '' }
const SERIAL_DEFAULT = { path: '', baudRate: '9600', dataBits: '8', stopBits: '1', parity: 'none', label: '', group: '' }
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
  const [tab, setTab] = useState(type || 'ssh')
  const [form, setForm] = useState(() => getDefault(type || 'ssh', initialData))
  const [ports, setPorts] = useState([])
  const [error, setError] = useState('')
  const [credDialog, setCredDialog] = useState(null)  // { username, password, callback } 或 null，表示是否显示凭证输入对话框以及初始值和连接回调函数

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
    if (tab === 'ssh' && !form.host?.trim()) return '请填写主机地址'
    if (tab === 'telnet' && !form.host?.trim()) return '请填写主机地址'
    if (tab === 'serial') {
      if (!form.path?.trim()) return '请选择串口设备'
      if (!isSerialPathInEnumeratedList(form.path, ports)) {
        return '串口路径须来自当前枚举列表；请点击「刷新」更新设备列表后，从列表中选择路径'
      }
    }
    if (form.group?.startsWith('/')) return '分组不允许为以"/"开头'
    if (form.group?.endsWith('/')) return '分组不允许为以"/"结尾，会导致分组名为空'
    if (form.group && /[\\:*?"\u003c\u003e|\x00]/.test(form.group)) return '分组不允许包含以下字符：\\ : * ? " < > |'
    if (form.label && /[\/\\:*?"\u003c\u003e|\x00]/.test(form.label)) return '标签名不允许包含以下字符：/ \\ : * ? " < > |'
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
    const hasUsername = username?.trim()
    const hasPassword = password?.trim()
    const hasPkey = privateKey?.trim()
    const autoFocusUsername = !hasUsername
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
            <div className="dialog-tabs">输入凭证</div>
            <button className="dialog-close" onClick={() => setCredDialog(null)}>×</button>
          </div>
          <div className="dialog-body">
            <FormRow label="用户名">
              <input placeholder="用户名" value={username} autoFocus={autoFocusUsername}
                onChange={e => setCredDialog(prev => ({ ...prev, username: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && applyCred()} />
            </FormRow>
            {keyAuth ? (
              <>
                <FormRow label="私钥路径">
                  <input
                    placeholder="/path/to/id_rsa"
                    value={privateKey}
                    autoFocus={hasUsername && !hasPkey}
                    onChange={e => setCredDialog(prev => ({ ...prev, privateKey: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && applyCred()}
                  />
                </FormRow>
                <FormRow label="私钥密码短语">
                  <input
                    type="password"
                    placeholder="可选"
                    value={passphrase}
                    onChange={e => setCredDialog(prev => ({ ...prev, passphrase: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && applyCred()}
                  />
                </FormRow>
              </>
            ) : (
              <FormRow label="密码">
                <input type="password" placeholder="密码" value={password} autoFocus={!autoFocusUsername && !hasPassword}
                  onChange={e => setCredDialog(prev => ({ ...prev, password: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && applyCred()} />
              </FormRow>
            )}
          </div>
          <div className="dialog-footer">
            <button className="btn-cancel" onClick={() => setCredDialog(null)}>取消</button>
            <button className="btn-connect" onClick={applyCred}>连接</button>
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
            {['ssh', 'telnet', 'serial'].map(t => (
              <button key={t} type="button" className={`dialog-tab ${tab===t?'active':''}`} onClick={() => switchTab(t)}>
                {t === 'ssh' ? 'SSH' : t === 'telnet' ? 'Telnet' : 'Serial'}
              </button>
            ))}
          </div>
          <button className="dialog-close" onClick={onClose}>×</button>
        </div>

        <div className="dialog-body">
          <FormRow label="标签">
            <input placeholder="自定义名称（可选）" value={form.label} onChange={e => set('label', e.target.value)} />
          </FormRow>
          <FormRow label="分组">
            <input placeholder="可选，空则保存在根分组" value={form.group} onChange={e => set('group', e.target.value)} list="group-list" />
            <datalist id="group-list">
              {(savedGroups||[]).map(g => <option key={g} value={g} />)}
            </datalist>
          </FormRow>
          <div className="dialog-divider" />
          <SshForm form={form} set={set} visible={tab==='ssh'} />
          <TelnetForm form={form} set={set} visible={tab==='telnet'} />
          <SerialForm form={form} set={set} ports={ports} visible={tab === 'serial'} onRefreshPorts={refreshSerialPorts} />
          {error && <div className="dialog-error">{error}</div>}
        </div>

        <div className="dialog-footer">
          <button className="btn-cancel" onClick={onClose}>取消</button>
          <button className="btn-save" onClick={() => act(onSaveOnly, false)}>保存</button>
          <button className="btn-connect" onClick={() => act(onConnect, true)}>直接连接</button>
          <button className="btn-save-connect" onClick={() => act(onSaveAndConnect, true)}>保存并连接</button>
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
  if (!visible) return null
  return (
    <>
      <FormRow label="主机">
        <input placeholder="hostname 或 IP" value={form.host} onChange={e => set('host', e.target.value)} autoFocus />
      </FormRow>
      <FormRow label="端口">
        <input type="number" value={form.port} onChange={e => set('port', e.target.value)} style={{width:80}} />
      </FormRow>
      <FormRow label="用户名">
        <input placeholder="可选，连接时输入" value={form.username || ''} onChange={e => set('username', e.target.value)} />
      </FormRow>
      <FormRow label="认证方式">
        <select value={form.authType} onChange={e => set('authType', e.target.value)}>
          <option value="password">密码</option>
          <option value="privateKey">私钥文件</option>
        </select>
      </FormRow>
      {form.authType === 'password' ? (
        <FormRow label="密码">
          <input type="password" placeholder="可选，连接时输入" value={form.password || ''} onChange={e => set('password', e.target.value)} />
        </FormRow>
      ) : (
        <>
          <FormRow label="私钥路径">
            <input placeholder="/path/to/id_rsa" value={form.privateKey} onChange={e => set('privateKey', e.target.value)} />
          </FormRow>
          <FormRow label="密码短语">
            <input type="password" placeholder="可选，私钥文件加密密码" value={form.passphrase} onChange={e => set('passphrase', e.target.value)} />
          </FormRow>
        </>
      )}
      <div className="dialog-divider" />
      <FormRow label="SFTP">
        <label className="toggle-row">
          <input type="checkbox" checked={form.enableSftp} onChange={e => set('enableSftp', e.target.checked)} />
          <span>启用 SFTP</span>
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
  if (!visible) return null
  return (
    <>
      <FormRow label="主机">
        <input placeholder="hostname 或 IP" value={form.host} onChange={e => set('host', e.target.value)} autoFocus />
      </FormRow>
      <FormRow label="端口">
        <input type="number" value={form.port} onChange={e => set('port', e.target.value)} style={{width:80}} />
      </FormRow>
      <FormRow label="用户名">
        <input placeholder="可选，连接时输入" value={form.username || ''} onChange={e => set('username', e.target.value)} />
      </FormRow>
      <FormRow label="密码">
        <input type="password" placeholder="可选，连接时输入" value={form.password || ''} onChange={e => set('password', e.target.value)} />
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
  if (!visible) return null
  return (
    <>
      <FormRow label="串口">
        <input
          className="dialog-serial-path-input"
          placeholder="从列表选择（须先枚举）"
          value={form.path}
          onChange={e => set('path', e.target.value)}
          list="port-list"
        />
        <button type="button" className="dialog-serial-refresh-btn" onClick={onRefreshPorts}>
          刷新
        </button>
        <datalist id="port-list">
          {ports.map(p => <option key={p.path} value={p.path}>{p.path}{p.manufacturer ? ` (${p.manufacturer})` : ''}</option>)}
        </datalist>
      </FormRow>
      <FormRow label="波特率">
        <select value={form.baudRate} onChange={e => set('baudRate', e.target.value)}>
          {BAUD_RATES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </FormRow>
      <FormRow label="数据位">
        <select value={form.dataBits} onChange={e => set('dataBits', e.target.value)}>
          {['5','6','7','8'].map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </FormRow>
      <FormRow label="停止位">
        <select value={form.stopBits} onChange={e => set('stopBits', e.target.value)}>
          {['1','2'].map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </FormRow>
      <FormRow label="校验位">
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
