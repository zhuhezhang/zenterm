import { useState, useEffect, useCallback } from 'react'
import '../styles/sftp.css'
const INVALID_NAME_CHARS = /[\/\\:*?"\u003c\u003e|\x00]/

function formatSize(bytes) {
  if (bytes == null) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

function formatDate(ms) {
  if (!ms) return '-'
  return new Date(ms).toLocaleString()
}

export default function SftpPanel({ session }) {
  const sftpSessionId = session?.id ? `${session.id}-sftp` : null
  const [path, setPath] = useState('/')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [renaming, setRenaming] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [creatingDir, setCreatingDir] = useState(false)
  const [createDirName, setCreateDirName] = useState('')
  const [progress, setProgress] = useState(null)

  const loadDir = useCallback(async (dirPath) => {
    if (!sftpSessionId) return
    setLoading(true)
    setError('')
    setSelected(null)
    try {
      const res = await window.zterm.sftp.list(sftpSessionId, dirPath)
      if (!res.success) throw new Error(res.error)
      setItems(res.items)
      setPath(dirPath)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [sftpSessionId])

  useEffect(() => {
    if (!sftpSessionId) return
    loadDir('/')
    const unsub = window.zterm.sftp.onProgress(sftpSessionId, (p) => setProgress(p))
    return unsub
  }, [sftpSessionId, loadDir])

  const goUp = () => {
    if (path === '/') return
    const parent = path.split('/').slice(0, -1).join('/') || '/'
    loadDir(parent)
  }

  const handleItemClick = (item) => {
    if (item.isDir) {
      loadDir(item.path)
    } else {
      setSelected(selected?.path === item.path ? null : item)
    }
  }

  const handleDelete = async (item, e) => {
    e.stopPropagation()
    if (!confirm(`确认删除 ${item.name}?`)) return
    const res = await window.zterm.sftp.delete(sftpSessionId, item.path)
    if (res.success) loadDir(path)
    else setError(res.error)
  }

  const startCreateDir = () => {
    setCreatingDir(true)
    setCreateDirName('')
  }

  const commitCreateDir = async () => {
    const name = createDirName.trim()
    if (!name) { setCreatingDir(false); return }
    if (INVALID_NAME_CHARS.test(name)) {
      setError('名称不允许包含以下字符：/ \\ : * ? " < > |')
      return
    }
    const newPath = path === '/' ? '/' + name : path + '/' + name
    const res = await window.zterm.sftp.mkdir(sftpSessionId, newPath)
    if (res.success) {
      setCreatingDir(false)
      setCreateDirName('')
      loadDir(path)
    }
    else setError(res.error)
  }

  const startRename = (item, e) => {
    e.stopPropagation()
    setRenaming(item)
    setRenameValue(item.name)
  }

  const commitRename = async () => {
    if (!renaming || !renameValue.trim()) { setRenaming(null); return }
    if (INVALID_NAME_CHARS.test(renameValue.trim())) {
      setError('名称不允许包含以下字符：/ \\ : * ? " < > |')
      return
    }
    const dir = path === '/' ? '' : path
    const oldPath = renaming.path
    const newPath = dir + '/' + renameValue.trim()
    setRenaming(null)
    const res = await window.zterm.sftp.rename(sftpSessionId, oldPath, newPath)
    if (res.success) loadDir(path)
    else setError(res.error)
  }

  const handleDownload = async (item, e) => {
    e.stopPropagation()
    if (item.isDir) return
    const dir = await window.zterm?.chooseDirectory?.()
    if (!dir) return
    const localPath = dir.endsWith('/') ? `${dir}${item.name}` : `${dir}/${item.name}`
    const res = await window.zterm.sftp.download(sftpSessionId, item.path, localPath)
    if (!res?.success) setError(res?.error || '下载失败')
  }

  const handleDropUpload = async (e) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer?.files || []).filter(f => f?.path)
    if (!files.length) return
    setError('')
    for (const f of files) {
      const remotePath = (path === '/' ? '' : path) + '/' + f.name
      const res = await window.zterm.sftp.upload(sftpSessionId, f.path, remotePath)
      if (!res?.success) {
        setError(res?.error || `上传失败: ${f.name}`)
        break
      }
    }
    loadDir(path)
  }

  const breadcrumbs = path === '/' ? ['/'] : ['/', ...path.split('/').filter(Boolean)]

  return (
    <div className="sftp-panel">
      <div className="sftp-header">
        <span className="sftp-title">📁 SFTP — {session.host}</span>
        <div className="sftp-toolbar">
          <button className="sftp-btn" onClick={startCreateDir} title="新建文件夹">+ 文件夹</button>
          <button className="sftp-btn" onClick={() => loadDir(path)} title="刷新">↻ 刷新</button>
        </div>
      </div>
      {creatingDir && (
        <div className="sftp-breadcrumb">
          <input
            className="sftp-rename-input"
            placeholder="输入新文件夹名称"
            value={createDirName}
            autoFocus
            onChange={e => setCreateDirName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitCreateDir()
              if (e.key === 'Escape') { setCreatingDir(false); setCreateDirName('') }
            }}
          />
          <button className="sftp-btn" onClick={commitCreateDir}>创建</button>
          <button className="sftp-btn" onClick={() => { setCreatingDir(false); setCreateDirName('') }}>取消</button>
        </div>
      )}

      <div className="sftp-breadcrumb">
        {breadcrumbs.map((crumb, i) => {
          const crumbPath = i === 0 ? '/' : '/' + breadcrumbs.slice(1, i + 1).join('/')
          return (
            <span key={i}>
              {i > 0 && <span className="sftp-sep">/</span>}
              <button className="sftp-crumb" onClick={() => loadDir(crumbPath)}>{crumb}</button>
            </span>
          )
        })}
      </div>

      {error && <div className="sftp-error">{error}</div>}

      {progress && (
        <div className="sftp-progress">
          <span>{progress.type === 'upload' ? '上传' : '下载'}: {progress.file.split('/').pop()}</span>
          <div className="sftp-progress-bar">
            <div className="sftp-progress-fill" style={{ width: progress.percent + '%' }} />
          </div>
          <span>{progress.percent}%</span>
        </div>
      )}

      <div className="sftp-file-list" onDragOver={e => e.preventDefault()} onDrop={handleDropUpload}>
        {path !== '/' && (
          <div className="sftp-item sftp-item-dir" onClick={goUp}>
            <span className="sftp-item-icon">📂</span>
            <span className="sftp-item-name">..</span>
          </div>
        )}
        {loading && <div className="sftp-loading">加载中...</div>}
        {!loading && items.map(item => (
          <div
            key={item.path}
            className={`sftp-item ${item.isDir ? 'sftp-item-dir' : 'sftp-item-file'} ${selected?.path === item.path ? 'selected' : ''} ${renaming?.path === item.path ? 'renaming' : ''}`}
            onClick={() => handleItemClick(item)}
          >
            <span className="sftp-item-icon">{item.isDir ? '📁' : '📄'}</span>
            {renaming?.path === item.path ? (
              <input
                className="sftp-rename-input"
                value={renameValue}
                autoFocus
                onClick={e => e.stopPropagation()}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null) }}
              />
            ) : (
              <span className="sftp-item-name">{item.name}</span>
            )}
            <span className="sftp-item-size">{item.isDir ? '' : formatSize(item.size)}</span>
            <span className="sftp-item-date">{formatDate(item.mtime)}</span>
            <div className="sftp-item-actions">
              {!item.isDir && <button className="sftp-action-btn" onClick={(e) => handleDownload(item, e)} title="下载">⭳</button>}
              <button className="sftp-action-btn" onClick={(e) => startRename(item, e)} title="重命名">✏</button>
              <button className="sftp-action-btn danger" onClick={(e) => handleDelete(item, e)} title="删除">🗑</button>
            </div>
          </div>
        ))}
        {!loading && items.length === 0 && !error && (
          <div className="sftp-empty">此目录为空</div>
        )}
      </div>
    </div>
  )
}
