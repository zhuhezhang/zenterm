import { useState, useEffect, useCallback } from 'react'
import '../styles/sftp.css'

/** 非法文件名字符 */
const INVALID_NAME_CHARS = /[\/\\:*?"\u003c\u003e|\x00]/

/** 
 * 格式化文件大小
 * @param {number} bytes 文件大小
 * @returns {string} 格式化后的文件大小
 */
function formatSize(bytes) {
  if (bytes == null) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

/** 
 * 格式化日期
 * @param {number} ms 日期时间戳
 * @returns {string} 格式化后的日期
 */
function formatDate(ms) {
  if (!ms) return '-'
  return new Date(ms).toLocaleString()
}

/** 
 * SFTP 面板组件
 * @param {Object} session 会话对象
 * @returns {JSX.Element} SFTP 面板组件
 */
export default function SftpPanel({ session }) {
  const sftpSessionId = session?.id ? `${session.id}-sftp` : null  // 会话 ID
  const [path, setPath] = useState('/')  // 当前路径
  const [items, setItems] = useState([])  // 文件列表
  const [loading, setLoading] = useState(false)  // 是否正在加载
  const [error, setError] = useState('')  // 错误信息
  const [selected, setSelected] = useState(null)  // 选中的文件
  const [renaming, setRenaming] = useState(null)  // 正在重命名的文件
  const [renameValue, setRenameValue] = useState('')  // 重命名输入值
  const [creatingDir, setCreatingDir] = useState(false)  // 是否正在创建文件夹
  const [createDirName, setCreateDirName] = useState('')  // 创建文件夹输入值
  const [progress, setProgress] = useState(null)  // 进度信息

  /** 
   * 加载目录
   * @param {string} dirPath 目录路径
   */
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

  useEffect(() => {  // 监听进度变化，每次会话 ID 变化时重新加载目录
    if (!sftpSessionId) return
    loadDir('/')
    const unsub = window.zterm.sftp.onProgress(sftpSessionId, (p) => setProgress(p))
    return unsub
  }, [sftpSessionId, loadDir])

  /** 上移到父目录 */
  const goUp = () => {
    if (path === '/') return
    const parent = path.split('/').slice(0, -1).join('/') || '/'
    loadDir(parent)
  }

  /** 
   * 点击文件（文件夹）
   * @param {Object} item 文件（文件夹）对象
   */
  const handleItemClick = (item) => {
    if (item.isDir) {
      loadDir(item.path)
    } else {
      setSelected(selected?.path === item.path ? null : item)
    }
  }

  /** 
   * 删除文件（文件夹）
   * @param {Object} item 文件（文件夹）对象
   * @param {Event} e 事件对象
   */
  const handleDelete = async (item, e) => {
    e.stopPropagation()
    if (!confirm(`确认删除 ${item.name}?`)) return
    const res = await window.zterm.sftp.delete(sftpSessionId, item.path)
    if (res.success) loadDir(path)
    else setError(res.error)
  }

  /** 开始创建文件夹 */
  const startCreateDir = () => {
    setCreatingDir(true)
    setCreateDirName('')
  }

  /** 提交创建文件夹 */
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

  /** 开始重命名 */
  const startRename = (item, e) => {
    e.stopPropagation()
    setRenaming(item)
    setRenameValue(item.name)
  }

  /** 提交重命名 */
  const commitRename = async () => {
    if (!renaming) { setRenaming(null); return }
    const nextName = renameValue.trim()
    const prevName = (renaming?.name ?? '').trim()
    if (!nextName) { setRenaming(null); return }
    if (nextName === prevName) { setRenaming(null); return }
    if (INVALID_NAME_CHARS.test(nextName)) {
      setError('名称不允许包含以下字符：/ \\ : * ? " < > |')
      return
    }
    const dir = path === '/' ? '' : path
    const oldPath = renaming.path
    const newPath = dir + '/' + nextName
    setRenaming(null)
    const res = await window.zterm.sftp.rename(sftpSessionId, oldPath, newPath)
    if (res.success) loadDir(path)
    else setError(res.error)
  }

  /** 
   * 下载文件（文件夹）
   * @param {Object} item 文件（文件夹）对象
   * @param {Event} e 事件对象
   */
  const handleDownload = async (item, e) => {
    e.stopPropagation()
    const dir = await window.zterm?.chooseDirectory?.()
    if (!dir) return
    const localBase = dir.endsWith('/') ? dir.slice(0, -1) : dir
    const localPath = `${localBase}/${item.name}`
    const res = item.isDir
      ? await window.zterm.sftp.downloadDir(sftpSessionId, item.path, localPath)
      : await window.zterm.sftp.download(sftpSessionId, item.path, localPath)
    if (!res?.success) setError(res?.error || '下载失败')
  }

  /** 
   * 确保远程目录存在 
   * @param {string} remoteDir 远程目录路径
   * @param {Set} cache 缓存集合
   * @returns {Promise<boolean>} 是否成功
  */
  const ensureRemoteDir = async (remoteDir, cache) => {
    if (!remoteDir || remoteDir === '/') return true
    if (cache.has(remoteDir)) return true // 如果缓存集合中已存在该目录，直接返回 true
    const parent = remoteDir.includes('/') ? remoteDir.split('/').slice(0, -1).join('/') || '/' : '/' // 获取父目录
    await ensureRemoteDir(parent, cache) // 递归确保父目录存在
    const res = await window.zterm.sftp.mkdir(sftpSessionId, remoteDir)
    if (res?.success) { cache.add(remoteDir); return true } // 如果创建成功，将目录添加到缓存集合中，并返回 true
    const msg = String(res?.error || '')
    if (/exist|exists|failure/i.test(msg)) { cache.add(remoteDir); return true } // 如果创建失败，且错误信息中包含 exist、exists 或 failure，将目录添加到缓存集合中，并返回 true
    throw new Error(res?.error || `mkdir失败: ${remoteDir}`) // 如果创建失败，且错误信息中不包含 exist、exists 或 failure，抛出错误
  }

  /** 
   * 递归收集拖拽项中的目录和文件，支持空文件夹上传
   * @param {Object} entry 目录项对象
   * @param {string} relBase 相对路径基础
   * @returns {Promise<{ files: Array, dirs: Array }>} 收集结果
   */
  const collectEntryNodes = async (entry, relBase = '') => {
    if (!entry) return { files: [], dirs: [] }
    if (entry.isFile) {  // 如果是文件
      const file = await new Promise((resolve) => entry.file(resolve))
      return { files: [{ file, relPath: relBase + file.name }], dirs: [] }  // 返回文件列表
    }
    if (entry.isDirectory) {  // 如果是目录
      const currentDir = relBase + entry.name  // 获取当前目录
      const reader = entry.createReader()
      const entries = await new Promise((resolve) => reader.readEntries(resolve))  // 读取目录项
      const files = []
      const dirs = [currentDir]
      for (const child of entries) {  // 遍历目录项，递归收集子目录项
        const childNodes = await collectEntryNodes(child, currentDir + '/')
        files.push(...childNodes.files)
        dirs.push(...childNodes.dirs)
      }
      return { files, dirs }
    }
    return { files: [], dirs: [] }
  }

  /** 
   * 处理拖拽上传
   * @param {Event} e 事件对象
   * @returns {Promise<void>} 是否成功
   */
  const handleDropUpload = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const cache = new Set()  // 缓存集合：存储已创建的远程目录
      const items = Array.from(e.dataTransfer?.items || [])  // 获取拖拽的文件列表
      const hasEntries = items.some(it => typeof it.webkitGetAsEntry === 'function')  // 是否支持 entry（可处理文件夹拖拽）
      if (hasEntries) {
        const entries = items.map(it => it.webkitGetAsEntry?.()).filter(Boolean)  // 获取文件项
        const filesToUpload = []  // 存储要上传的文件列表
        const dirsToCreate = new Set()  // 存储要创建的目录列表（支持空文件夹）
        for (const ent of entries) {
          const nodes = await collectEntryNodes(ent, '')
          filesToUpload.push(...nodes.files)
          nodes.dirs.forEach((dir) => dirsToCreate.add(dir))
        }
        if (!filesToUpload.length && dirsToCreate.size === 0) return

        const remoteBase = (path === '/' ? '' : path) + '/'
        for (const relDir of Array.from(dirsToCreate).sort((a, b) => a.length - b.length)) {
          await ensureRemoteDir(remoteBase + relDir, cache)
        }

        for (const { file, relPath } of filesToUpload) {  // 遍历要上传的文件列表
          if (!file?.path) continue
          const remotePath = remoteBase + relPath
          const remoteDir = remotePath.split('/').slice(0, -1).join('/') || '/' // 获取远程目录
          await ensureRemoteDir(remoteDir, cache) // 确保远程目录存在
          const res = await window.zterm.sftp.upload(sftpSessionId, file.path, remotePath) // 上传文件
          if (!res?.success) throw new Error(res?.error || `上传失败: ${relPath}`) // 如果上传失败，抛出错误
        }
        loadDir(path)
        return
      }

      const files = Array.from(e.dataTransfer?.files || []).filter(f => f?.path)  // 获取拖拽的文件列表
      if (!files.length) return
      for (const f of files) {  // 遍历要上传的文件列表
        const remotePath = (path === '/' ? '' : path) + '/' + f.name // 获取远程路径
        const res = await window.zterm.sftp.upload(sftpSessionId, f.path, remotePath) // 上传文件
        if (!res?.success) throw new Error(res?.error || `上传失败: ${f.name}`) // 如果上传失败，抛出错误
      }
      loadDir(path) // 刷新目录
    } catch (err) {
      setError(err?.message || String(err))
    }
  }

  const breadcrumbs = path === '/' ? ['/'] : ['/', ...path.split('/').filter(Boolean)]  // 面包屑导航：当前路径为根目录时，只显示根目录；否则显示根目录和当前路径

  return (
    <div className="sftp-panel">
      <div className="sftp-header">
        <span className="sftp-title">SFTP — {session.host}</span>
        <div className="sftp-toolbar">
          <button className="sftp-btn" onClick={startCreateDir} title="新建文件夹">+ 文件夹</button>
          <button className="sftp-btn" onClick={() => { loadDir(path); setProgress(null) }} title="刷新">↻ 刷新</button>
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
          <button id="sftp-create-dir-btn" className="sftp-btn" onClick={commitCreateDir}>创建</button>
          <button id="sftp-cancel-dir-btn" className="sftp-btn" onClick={() => { setCreatingDir(false); setCreateDirName('') }}>取消</button>
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
              <button className="sftp-action-btn" onClick={(e) => handleDownload(item, e)} title="下载">⭳</button>
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
