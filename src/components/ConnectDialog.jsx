import React, { useState, useEffect } from 'react'
import '../styles/dialog.css'

const SSH_DEFAULT = { host: '', port: '22', username: '', password: '', privateKey: '', passphrase: '', authType: 'password', label: '', group: '', enableSftp: false }
const TELNET_DEFAULT = { host: '', port: '23', label: '', group: '' }
const SERIAL_DEFAULT = { path: '', baudRate: '9600', dataBits: '8', stopBits: '1', parity: 'none', label: '', group: '' }
const BAUD_RATES = ['110','300','600','1200','2400','4800','9600','14400','19200','38400','57600','115200','128000','256000']
const PARITIES = ['none','even','odd','mark','space']

function getDefault(tab, initial) {
  const base = tab === 'ssh' ? { ...SSH_DEFAULT } : tab === 'telnet' ? { ...TELNET_DEFAULT } : { ...SERIAL_DEFAULT }
  if (initial) return { ...base, ...initial }
  return base
}

function buildLabel(tab, form) {
  if (tab === 'serial') {
    const raw = form.path || 'Serial'
    return raw.replace(/[\/\\:*?"\u003c\u003e|\x00]/g, '').trim() || 'Serial'
  }
  const raw = (form.username ? form.username + '@' : '') + (form.host || tab.toUpperCase())
  return raw.replace(/[\/\\:*?"\u003c\u003e|\x00]/g, '').trim() || tab.toUpperCase()
}

export default function ConnectDialog({ type: initType, initialData, savedGroups, onConnect, onSaveAndConnect, onSaveOnly, onClose }) {
  const [tab, setTab] = useState(initType || 'ssh')
  const [form, setForm] = useState(() => getDefault(initType || 'ssh', initialData))
  const [ports, setPorts] = useState([])
  const [error, setError] = useState('')
  const [credDialog, setCredDialog] = useState(null)  // { username, password }

  const switchTab = (t) => {
    if (t === tab) return
    // 切换类型时保留已有所有参数，只补齐当前协议缺省字段
    setForm(prev => ({ ...prev, ...getDefault(t, prev) }))
    setTab(t)
    setError('')
  }

  useEffect(() => {
    setError('')
    if (tab === 'serial') {
      window.zterm?.serial.listPorts().then(res => { if (res?.success) setPorts(res.ports) })
    }
  }, [tab])

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const validate = () => {
    if (tab === 'ssh' && !form.host?.trim()) return '请填写主机地址'
    if (tab === 'telnet' && !form.host?.trim()) return '请填写主机地址'
    if (tab === 'serial' && !form.path?.trim()) return '请选择或输入串口路径'
    if (form.group?.startsWith('/')) return '分组不允许为以"/"开头'
    if (form.group?.endsWith('/')) return '分组不允许为以"/"结尾，会导致分组名为空'
    if (form.group && /[\\:*?"\u003c\u003e|\x00]/.test(form.group)) return '分组不允许包含以下字符：\\ : * ? " < > |'
    if (form.label && /[\/\\:*?"\u003c\u003e|\x00]/.test(form.label)) return '标签名不允许包含以下字符：/ \\ : * ? " < > |'
    return ''
  }

  const buildConfig = () => ({
    type: tab, ...form,
    port: parseInt(form.port) || undefined,
    baudRate: parseInt(form.baudRate) || 9600,
    dataBits: parseInt(form.dataBits) || 8,
    stopBits: parseInt(form.stopBits) || 1,
    label: form.label?.trim() || buildLabel(tab, form),
  })

  // 检查是否需要输入凭证（用户名或密码为空）
  const needsCredentials = (config) => {
    return (config.type === 'ssh' || config.type === 'telnet') && 
           (!config.username?.trim() || !config.password?.trim())
  }

  const act = (fn, requireCreds = true) => {
    const e = validate()
    if (e) return setError(e)
    const config = buildConfig()
    // 只有在 requireCreds=true 时才检查凭证（保存会话时不检查）
    if (requireCreds && needsCredentials(config)) {
      setCredDialog({ 
        username: config.username || '', 
        password: config.password || '',
        callback: fn 
      })
      return
    }
    fn(config)
  }

  if (credDialog) {
    const { username, password, callback } = credDialog
    const hasUsername = username?.trim()
    const hasPassword = password?.trim()
    const autoFocusUsername = !hasUsername
    
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
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const config = { ...buildConfig(), username, password }
                    setCredDialog(null)
                    callback(config)
                  }
                }} />
            </FormRow>
            <FormRow label="密码">
              <input type="password" placeholder="密码" value={password} autoFocus={!autoFocusUsername && !hasPassword}
                onChange={e => setCredDialog(prev => ({ ...prev, password: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const config = { ...buildConfig(), username, password }
                    setCredDialog(null)
                    callback(config)
                  }
                }} />
            </FormRow>
          </div>
          <div className="dialog-footer">
            <button className="btn-cancel" onClick={() => setCredDialog(null)}>取消</button>
            <button className="btn-connect" onClick={() => {
              const config = { ...buildConfig(), username, password }
              setCredDialog(null)
              callback(config)
            }}>连接</button>
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
              <button key={t} className={`dialog-tab ${tab===t?'active':''}`} onClick={() => switchTab(t)}>
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
            <input placeholder="分组（如：工作/个人）" value={form.group} onChange={e => set('group', e.target.value)} list="group-list" />
            <datalist id="group-list">
              {(savedGroups||[]).map(g => <option key={g} value={g} />)}
            </datalist>
          </FormRow>
          <div className="dialog-divider" />
          <SshForm form={form} set={set} visible={tab==='ssh'} />
          <TelnetForm form={form} set={set} visible={tab==='telnet'} />
          <SerialForm form={form} set={set} ports={ports} visible={tab==='serial'} />
          {error && <div className="dialog-error">{error}</div>}
        </div>

        <div className="dialog-footer">
          <button className="btn-cancel" onClick={onClose}>取消</button>
          <button className="btn-save" onClick={() => act(onSaveOnly, false)}>保存会话</button>
          <button className="btn-save-connect" onClick={() => act(onSaveAndConnect, true)}>保存并连接</button>
          <button className="btn-connect" onClick={() => act(onConnect, true)}>直接连接</button>
        </div>
      </div>
    </div>
  )
}

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
            <input type="password" placeholder="可选" value={form.passphrase} onChange={e => set('passphrase', e.target.value)} />
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

function SerialForm({ form, set, ports, visible }) {
  if (!visible) return null
  return (
    <>
      <FormRow label="串口">
        <input 
          placeholder="选择或输入串口路径" 
          value={form.path} 
          onChange={e => set('path', e.target.value)}
          list="port-list"
        />
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

function FormRow({ label, children }) {
  return (
    <div className="form-row">
      <label className="form-label">{label}</label>
      <div className="form-control">{children}</div>
    </div>
  )
}
