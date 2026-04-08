import React, { useState, useEffect, useCallback } from 'react'
import '../styles/sftp.css'

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

export default function SftpPanel({ session, onClose }) {
  const [path, setPath] = useState('/')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [renaming, setRenaming] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [progress, setProgress] = useState(null)

  const loadDir = useCallback(async (dirPath) => {
    setLoading(true)
    setError('')
    setSelected(null)
    try {
      const res = await window.zterm.sftp.list(session.id, dirPath)
      if (!res.success) throw new Error(res.error)
      setItems(res.items)
      setPath(dirPath)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [session.id])

  useEffect(() => {
    loadDir('/')
    const unsub = window.zterm.sftp.onProgress(session.id, (p) => setProgress(p))
    return unsub
  }, [session.id])

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
    const res = await window.zterm.sftp.delete(session.id, item.path)
    if (res.success) loadDir(path)
    else setError(res.error)
  }

  const handleMkdir = async () => {
    const name = prompt('新建文件夹名称:')
    if (!name) return
    const newPath = path === '/' ? '/' + name : path + '/' + name
    const res = await window.zterm.sftp.mkdir(session.id, newPath)
    if (res.success) loadDir(path)
    else setError(res.error)
  }

  const startRename = (item, e) => {
    e.stopPropagation()
    setRenaming(item)
    setRenameValue(item.name)
  }

  const commitRename = async () => {
    if (!renaming || !renameValue.trim()) { setRenaming(null); return }
    const dir = path === '/' ? '' : path
    const oldPath = renaming.path
    const newPath = dir + '/' + renameValue.trim()
    setRenaming(null)
    const res = await window.zterm.sftp.rename(session.id, oldPath, newPath)
    if (res.success) loadDir(path)
    else setError(res.error)
  }

  const breadcrumbs = path === '/' ? ['/'] : ['/', ...path.split('/').filter(Boolean)]

  return (
    <div className="sftp-panel">
      <div className="sftp-header">
        <span className="sftp-title">📁 SFTP — {session.host}</span>
        <div className="sftp-toolbar">
          <button className="sftp-btn" onClick={handleMkdir} title="新建文件夹">+ 文件夹</button>
          <button className="sftp-btn" onClick={() => loadDir(path)} title="刷新">↻ 刷新</button>
        </div>
        <button className="sftp-close" onClick={onClose} title="关闭">×</button>
      </div>

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

      <div className="sftp-file-list">
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
            className={`sftp-item ${item.isDir ? 'sftp-item-dir' : 'sftp-item-file'} ${selected?.path === item.path ? 'selected' : ''}`}
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
