import { useState, useEffect, useCallback, useRef, useLayoutEffect, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../context/I18nContext'
import { alertIpcFailure, formatIpcResponseError, formatThrownIpcError } from '@/lib/ipc/formatIpcError'
import { assertIpcSuccess, unwrapIpcOk } from '../lib/ipc/ipcError'
import { isIpcSuccess } from '@/lib/ipc/ipcResponse'
import { INVALID_LABEL_CHARS } from '../../shared/safeFileName'
import { getZterm } from '@/lib/ipc/getZterm'
import type { SftpPanelProps, SftpRemoteItem } from '@/types/components'
import type { SftpFileContextMenu } from '@/types/sftp'
import type { IpcResult } from '@/types/ipc'
import type { ZTermProgress } from '@/types/zterm'
import '../styles/sftp.css'

/**
 * 沙盒渲染进程不提供 File.path，须通过 preload 的 webUtils.getPathForFile。
 * @param {File} file 文件对象
 * @returns {string} 文件路径
 */
function getLocalFilePath(file: File): string {
  if (!file) return ''
  const bridge = window.zterm?.paths?.getPathForFile
  if (typeof bridge === 'function') {
    try {
      const p = bridge(file)
      if (p) return p
    } catch {
      /* 非磁盘文件等 */
    }
  }
  return file.path || ''
}

/** 
 * 读满目录项（readEntries 单次最多约 100 条，须循环）
 * @param {DirectoryReader} reader 目录读取器
 * @returns {Promise<Array<FileEntry>>} 目录项列表
 */
function readAllDirEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve) => {
    const all: FileSystemEntry[] = []
    const step = () => {
      reader.readEntries((batch) => {
        if (!batch.length) resolve(all)
        else {
          all.push(...batch)
          step()
        }
      })
    }
    step()
  })
}

/** 
 * 格式化文件大小
 * @param {number} bytes 文件大小
 * @returns {string} 格式化后的文件大小
 */
function formatSize(bytes: number | null | undefined): string {
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
function formatDate(ms: number | null | undefined): string {
  if (!ms) return '-'
  return new Date(ms).toLocaleString()
}

/** 
 * SFTP 面板组件
 * @param {Object} session 会话对象
 * @returns {JSX.Element} SFTP 面板组件
 */
export default function SftpPanel({ session }: SftpPanelProps) {
  const { t } = useI18n()
  const ipcErr = (res: IpcResult | null | undefined, fallbackKey?: string) =>
    formatIpcResponseError(t, res) || (fallbackKey ? t(fallbackKey) : '')
  const showErr = (e: unknown) => alert(formatThrownIpcError(t, e) || String(e))
  const sftpSessionId = session?.id ? `${session.id}-sftp` : null
  const [path, setPath] = useState('/')
  const [items, setItems] = useState<SftpRemoteItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<SftpRemoteItem | null>(null)
  const [renaming, setRenaming] = useState<SftpRemoteItem | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [creatingDir, setCreatingDir] = useState(false)
  const [createDirName, setCreateDirName] = useState('')
  const [progress, setProgress] = useState<ZTermProgress | null>(null)
  const fileUploadInputRef = useRef<HTMLInputElement | null>(null)
  const folderUploadInputRef = useRef<HTMLInputElement | null>(null)
  const uploadDetailsRef = useRef<HTMLDetailsElement | null>(null)
  const [fileCtx, setFileCtx] = useState<SftpFileContextMenu | null>(null)
  const [fileMenuPos, setFileMenuPos] = useState({ x: 0, y: 0 })
  const fileCtxMenuRef = useRef<HTMLDivElement | null>(null)

  /** 
   * 加载目录
   * @param {string} dirPath 目录路径
   */
  const loadDir = useCallback(async (dirPath: string) => {
    if (!sftpSessionId) return
    setFileCtx(null)
    setLoading(true)
    setSelected(null)
    try {
      const res = await getZterm().sftp.list(sftpSessionId, dirPath)
      const content = unwrapIpcOk(res)
      setItems(Array.isArray(content.items) ? (content.items as SftpRemoteItem[]) : [])
      setPath(dirPath)
    } catch (e) {
      showErr(e)
    } finally {
      setLoading(false)
    }
  }, [sftpSessionId, t])

  useEffect(() => {  // 监听进度变化，每次会话 ID 变化时重新加载目录
    if (!sftpSessionId) return
    loadDir('/')
    const unsub = getZterm().sftp.onProgress(sftpSessionId, (p) => setProgress(p))
    return unsub
  }, [sftpSessionId, loadDir])

  useLayoutEffect(() => {  // 根据视口边界动态修正菜单位置，避免底部/右侧被遮挡
    if (!fileCtx) return
    const el = fileCtxMenuRef.current
    if (!el) {
      setFileMenuPos({ x: fileCtx.x, y: fileCtx.y })
      return
    }
    const margin = 8
    const maxX = Math.max(margin, window.innerWidth - el.offsetWidth - margin)
    const maxY = Math.max(margin, window.innerHeight - el.offsetHeight - margin)
    setFileMenuPos({
      x: Math.max(margin, Math.min(fileCtx.x, maxX)),
      y: Math.max(margin, Math.min(fileCtx.y, maxY)),
    })
  }, [fileCtx])

  useEffect(() => {  // 监听文件行右键菜单点击事件，点击菜单外区域自动关闭菜单
    if (!fileCtx) return
    const onDocMouseDown = (e: globalThis.MouseEvent) => {
      if ((e.target as Element | null)?.closest?.('.context-menu')) return
      setFileCtx(null)
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setFileCtx(null)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [fileCtx])

  useEffect(() => {  // 监听上传菜单点击事件，点击菜单外区域自动关闭菜单
    const closeUploadMenuIfOutside = (e: globalThis.MouseEvent) => {
      const root = uploadDetailsRef.current
      if (!root?.open) return
      if (e.target instanceof Node && root.contains(e.target)) return
      root.removeAttribute('open')
    }
    const onEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const root = uploadDetailsRef.current
      if (!root?.open) return
      root.removeAttribute('open')
    }
    document.addEventListener('mousedown', closeUploadMenuIfOutside)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', closeUploadMenuIfOutside)
      document.removeEventListener('keydown', onEscape)
    }
  }, [])

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
  const handleItemClick = (item: SftpRemoteItem) => {
    if (item.isDir) {
      loadDir(item.path ?? path)
    } else {
      setSelected(selected?.path === item.path ? null : item)
    }
  }

  /** 
   * 删除文件（文件夹）
   * @param {Object} item 文件（文件夹）对象
   * @param {Event} e 事件对象
   */
  const handleDelete = async (item: SftpRemoteItem) => {
    if (!sftpSessionId) return
    if (!confirm(t('sftp.confirmDelete', { name: item.name }))) return
    const res = await getZterm().sftp.delete(sftpSessionId, item.path ?? '')
    if (res.success) loadDir(path)
    else alert(ipcErr(res, 'sftp.unknownError'))
  }

  /** 开始创建文件夹 */
  const startCreateDir = () => {
    setCreatingDir(true)
    setCreateDirName('')
  }

  /** 提交创建文件夹 */
  const commitCreateDir = async () => {
    if (!sftpSessionId) return
    const name = createDirName.trim()
    if (!name) { setCreatingDir(false); return }
    if (INVALID_LABEL_CHARS.test(name)) {
      alert(t('sftp.nameInvalid'))
      return
    }
    const newPath = path === '/' ? '/' + name : path + '/' + name
    const res = await getZterm().sftp.mkdir(sftpSessionId, newPath)
    if (res.success) {
      setCreatingDir(false)
      setCreateDirName('')
      loadDir(path)
    }
    else alert(ipcErr(res, 'sftp.unknownError'))
  }

  /** 
   * 开始重命名
   * @param {Object} item 文件（文件夹）对象
   */
  const startRename = (item: SftpRemoteItem) => {
    setRenaming(item)
    setRenameValue(item.name)
  }

  /** 提交重命名 */
  const commitRename = async () => {
    if (!sftpSessionId) return
    if (!renaming) { setRenaming(null); return }
    const nextName = renameValue.trim()
    const prevName = (renaming?.name ?? '').trim()
    if (!nextName) { setRenaming(null); return }
    if (nextName === prevName) { setRenaming(null); return }
    if (INVALID_LABEL_CHARS.test(nextName)) {
      alert(t('sftp.nameInvalid'))
      return
    }
    const dir = path === '/' ? '' : path
    const oldPath = renaming.path ?? ''
    const newPath = dir + '/' + nextName
    setRenaming(null)
    const res = await getZterm().sftp.rename(sftpSessionId, oldPath, newPath)
    if (res.success) loadDir(path)
    else alert(ipcErr(res, 'sftp.unknownError'))
  }

  /** 
   * 下载文件（文件夹）
   * @param {Object} item 文件（文件夹）对象
   * @param {Event} e 事件对象
   */
  const handleDownload = async (item: SftpRemoteItem) => {
    if (!sftpSessionId) return
    const pick = await getZterm().paths.chooseDirectory()
    const dir = pick?.content?.path
    if (!pick?.success || pick?.content?.canceled || !dir) return
    const localBase = dir.endsWith('/') ? dir.slice(0, -1) : dir
    const localPath = `${localBase}/${item.name}`
    const remotePath = item.path ?? ''
    const res = item.isDir
      ? await getZterm().sftp.downloadDir(sftpSessionId, remotePath, localPath)
      : await getZterm().sftp.download(sftpSessionId, remotePath, localPath)
    alertIpcFailure(t, res, 'sftp.downloadFail')
  }

  /** 
   * 确保远程目录存在 
   * @param {string} remoteDir 远程目录路径
   * @param {Set} cache 缓存集合
   * @returns {Promise<boolean>} 是否成功
  */
  const ensureRemoteDir = async (remoteDir: string, cache: Set<string>) => {
    if (!sftpSessionId) return false
    if (!remoteDir || remoteDir === '/') return true
    if (cache.has(remoteDir)) return true // 如果缓存集合中已存在该目录，直接返回 true
    const parent = remoteDir.includes('/') ? remoteDir.split('/').slice(0, -1).join('/') || '/' : '/' // 获取父目录
    await ensureRemoteDir(parent, cache) // 递归确保父目录存在
    const res = await getZterm().sftp.mkdir(sftpSessionId, remoteDir)
    if (isIpcSuccess(res)) { cache.add(remoteDir); return true }
    const msg = ipcErr(res, '')
    if (/exist|exists|failure/i.test(msg)) { cache.add(remoteDir); return true }
    assertIpcSuccess(res)
  }

  /** 
   * 递归收集拖拽项中的目录和文件，支持空文件夹上传
   * @param {Object} entry 目录项对象
   * @param {string} relBase 相对路径基础
   * @returns {Promise<{ files: Array, dirs: Array }>} 收集结果
   */
  const collectEntryNodes = async (
    entry: FileSystemEntry | null | undefined,
    relBase = '',
  ): Promise<{ files: { file: File; relPath: string }[]; dirs: string[] }> => {
    if (!entry) return { files: [], dirs: [] }
    if (entry.isFile) {  // 如果是文件
      const fileEntry = entry as FileSystemFileEntry
      const file = await new Promise<File>((resolve) => fileEntry.file(resolve))
      return { files: [{ file, relPath: relBase + file.name }], dirs: [] }  // 返回文件列表
    }
    if (entry.isDirectory) {  // 如果是目录
      const dirEntry = entry as FileSystemDirectoryEntry
      const currentDir = relBase + dirEntry.name  // 获取当前目录
      const reader = dirEntry.createReader()
      const entries = await readAllDirEntries(reader)
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
   * 通过选择框上传多个顶层文件（无目录结构） 
   * @param {FileList} fileList 文件列表
   * @returns {Promise<void>} 是否成功
   */
  const handlePickFilesUpload = async (fileList: FileList | null) => {
    if (!sftpSessionId) return
    try {
      const files = Array.from(fileList || []).filter((f: File) => getLocalFilePath(f))
      if (!files.length) return
      for (const f of files) {
        const remotePath = (path === '/' ? '' : path) + '/' + f.name
        const res = await getZterm().sftp.upload(sftpSessionId, getLocalFilePath(f), remotePath)
        assertIpcSuccess(res)
      }
      loadDir(path)
    } catch (err) {
      showErr(err)
    }
  }

  /** 
   * 通过选择框上传文件夹（保留 webkitRelativePath 目录结构）
   * @param {FileList} fileList 文件列表
   * @returns {Promise<void>} 是否成功
   */
  const handlePickFolderUpload = async (fileList: FileList | null) => {
    if (!sftpSessionId) return
    try {
      const files = Array.from(fileList || []).filter(
        (f: File) => getLocalFilePath(f) && f.webkitRelativePath,
      )
      if (!files.length) return
      const cache = new Set<string>()
      const dirsToCreate = new Set<string>()
      for (const f of files) {
        const segments = f.webkitRelativePath.split('/')
        for (let i = 1; i < segments.length; i++) {
          dirsToCreate.add(segments.slice(0, i).join('/'))
        }
      }
      const remoteBase = (path === '/' ? '' : path) + '/'
      for (const relDir of [...dirsToCreate].sort((a, b) => a.length - b.length)) {
        await ensureRemoteDir(remoteBase + relDir, cache)
      }
      for (const f of files) {
        const remotePath = remoteBase + f.webkitRelativePath
        const remoteDir = remotePath.split('/').slice(0, -1).join('/') || '/'
        await ensureRemoteDir(remoteDir, cache)
        const res = await getZterm().sftp.upload(sftpSessionId, getLocalFilePath(f), remotePath)
        assertIpcSuccess(res)
      }
      loadDir(path)
    } catch (err) {
      showErr(err)
    }
  }

  /** 
   * 处理拖拽上传
   * @param {Event} e 事件对象
   * @returns {Promise<void>} 是否成功
   */
  const handleDropUpload = async (e: ReactDragEvent<HTMLDivElement>) => {
    if (!sftpSessionId) return
    e.preventDefault()
    try {
      const cache = new Set<string>()  // 缓存集合：存储已创建的远程目录
      const items = Array.from(e.dataTransfer?.items || []) as DataTransferItem[]  // 获取拖拽的文件列表
      const hasEntries = items.some((it) => typeof it.webkitGetAsEntry === 'function')  // 是否支持 entry（可处理文件夹拖拽）
      if (hasEntries) {
        const entries = items.map((it) => it.webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[]  // 获取文件项
        const filesToUpload: { file: File; relPath: string }[] = []  // 存储要上传的文件列表
        const dirsToCreate = new Set<string>()  // 存储要创建的目录列表（支持空文件夹）
        for (const ent of entries) {
          const nodes = await collectEntryNodes(ent, '')
          filesToUpload.push(...nodes.files)
          nodes.dirs.forEach((dir) => dirsToCreate.add(dir))
        }
        if (!filesToUpload.length && dirsToCreate.size === 0) return

        const remoteBase = (path === '/' ? '' : path) + '/'
        for (const relDir of [...dirsToCreate].sort((a, b) => a.length - b.length)) {
          await ensureRemoteDir(remoteBase + relDir, cache)
        }

        for (const { file, relPath } of filesToUpload) {  // 遍历要上传的文件列表
          const localPath = getLocalFilePath(file)
          if (!localPath) continue
          const remotePath = remoteBase + relPath
          const remoteDir = remotePath.split('/').slice(0, -1).join('/') || '/' // 获取远程目录
          await ensureRemoteDir(remoteDir, cache) // 确保远程目录存在
          const res = await getZterm().sftp.upload(sftpSessionId, localPath, remotePath) // 上传文件
          assertIpcSuccess(res)
        }
        loadDir(path)
        return
      }

      const droppedFiles = (Array.from(e.dataTransfer?.files ?? []) as File[]).filter((f) => getLocalFilePath(f))  // 获取拖拽的文件列表
      if (!droppedFiles.length) return
      for (const f of droppedFiles) {  // 遍历要上传的文件列表
        const remotePath = (path === '/' ? '' : path) + '/' + f.name // 获取远程路径
        const res = await getZterm().sftp.upload(sftpSessionId, getLocalFilePath(f), remotePath) // 上传文件
        assertIpcSuccess(res)
      }
      loadDir(path) // 刷新目录
    } catch (err) {
      showErr(err)
    }
  }

  /**
   * 在文件/文件夹行上打开右键菜单
   * @param {Event} e 事件对象
   * @param {Object} item 文件（文件夹）对象
   */
  const openFileCtx = (e: ReactMouseEvent, item: SftpRemoteItem) => {
    e.preventDefault()
    e.stopPropagation()
    setFileMenuPos({ x: e.clientX, y: e.clientY })
    setFileCtx({ x: e.clientX, y: e.clientY, item })
    setSelected(item)
  }

  /** 面包屑导航：当前路径为根目录时，只显示根目录；否则显示根目录和当前路径 */
  const breadcrumbs = path === '/' ? ['/'] : ['/', ...path.split('/').filter(Boolean)]

  return (
    <div className="sftp-panel">
      <div className="sftp-header">
        <span className="sftp-title">SFTP — {session.host}</span>
        <div className="sftp-toolbar">
          <details ref={uploadDetailsRef} className="sftp-upload-details">
            <summary className="sftp-btn sftp-upload-summary" title={t('sftp.uploadTitle')}>{t('sftp.upload')}</summary>
            <div className="sftp-upload-menu" role="menu">
              <button
                type="button"
                className="sftp-upload-menu-item"
                onClick={() => {
                  uploadDetailsRef.current?.removeAttribute('open')
                  fileUploadInputRef.current?.click()
                }}
              >
                {t('sftp.pickFiles')}
              </button>
              <button
                type="button"
                className="sftp-upload-menu-item"
                onClick={() => {
                  uploadDetailsRef.current?.removeAttribute('open')
                  folderUploadInputRef.current?.click()
                }}
              >
                {t('sftp.pickFolder')}
              </button>
            </div>
          </details>
          <input
            ref={fileUploadInputRef}
            type="file"
            multiple
            className="sftp-hidden-input"
            onChange={(e) => {
              handlePickFilesUpload(e.target.files)
              e.target.value = ''
            }}
          />
          <input
            ref={folderUploadInputRef}
            type="file"
            className="sftp-hidden-input"
            webkitdirectory=""
            directory=""
            multiple
            onChange={(e) => {
              handlePickFolderUpload(e.target.files)
              e.target.value = ''
            }}
          />
          <button type="button" className="sftp-btn" onClick={startCreateDir} title={t('sftp.newFolderTitle')}>{t('sftp.newFolder')}</button>
          <button type="button" className="sftp-btn" onClick={() => { loadDir(path); setProgress(null) }} title={t('sftp.refreshTitle')}>{t('sftp.refresh')}</button>
        </div>
      </div>
      {creatingDir && (
        <div className="sftp-breadcrumb">
          <input
            className="sftp-rename-input"
            placeholder={t('sftp.newFolderPh')}
            value={createDirName}
            autoFocus
            onChange={e => setCreateDirName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitCreateDir()
              if (e.key === 'Escape') { setCreatingDir(false); setCreateDirName('') }
            }}
          />
          <button type="button" id="sftp-create-dir-btn" className="sftp-btn" onClick={commitCreateDir}>{t('sftp.create')}</button>
          <button type="button" id="sftp-cancel-dir-btn" className="sftp-btn" onClick={() => { setCreatingDir(false); setCreateDirName('') }}>{t('sftp.cancel')}</button>
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

      {progress && (
        <div className="sftp-progress">
          <span>{progress.type === 'upload' ? t('sftp.progressUp') : t('sftp.progressDown')}: {(progress.file ?? '').split('/').pop()}</span>
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
        {loading && <div className="sftp-loading">{t('sftp.loading')}</div>}
        {!loading && items.map(item => (
          <div
            key={item.path}
            className={`sftp-item ${item.isDir ? 'sftp-item-dir' : 'sftp-item-file'} ${selected?.path === item.path ? 'selected' : ''} ${renaming?.path === item.path ? 'renaming' : ''}`}
            onClick={() => handleItemClick(item)}
            onContextMenu={(e) => openFileCtx(e, item)}
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
          </div>
        ))}
        {!loading && items.length === 0 && (
          <div className="sftp-empty">{t('sftp.empty')}</div>
        )}
      </div>
      {fileCtx && document.body && createPortal(
        <div
          ref={fileCtxMenuRef}
          className="context-menu"
          style={{ top: fileMenuPos.y, left: fileMenuPos.x }}
          onClick={e => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              const target = fileCtx.item
              setFileCtx(null)
              void handleDownload(target)
            }}
          >
            {t('sftp.download')}
          </button>
          <button
            type="button"
            onClick={() => {
              const target = fileCtx.item
              setFileCtx(null)
              startRename(target)
            }}
          >
            {t('sftp.rename')}
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              const target = fileCtx.item
              setFileCtx(null)
              void handleDelete(target)
            }}
          >
            {t('sftp.delete')}
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}
