import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from 'react'
import type { SftpRemoteItem } from '@/types/components'
import { formatSftpSize, formatSftpDate } from '@/lib/sftp/format'

export interface SftpFileListProps {
  path: string
  items: SftpRemoteItem[]
  loading: boolean
  selected: SftpRemoteItem | null
  renaming: SftpRemoteItem | null
  renameValue: string
  t: (path: string, params?: Record<string, string | number>) => string
  onGoUp: () => void
  onItemClick: (item: SftpRemoteItem) => void
  onItemContextMenu: (e: ReactMouseEvent, item: SftpRemoteItem) => void
  onRenameValueChange: (value: string) => void
  onCommitRename: () => void
  onCancelRename: () => void
  onDropUpload: (e: ReactDragEvent<HTMLDivElement>) => void
}

export default function SftpFileList({
  path,
  items,
  loading,
  selected,
  renaming,
  renameValue,
  t,
  onGoUp,
  onItemClick,
  onItemContextMenu,
  onRenameValueChange,
  onCommitRename,
  onCancelRename,
  onDropUpload,
}: SftpFileListProps) {
  return (
    <div className="sftp-file-list" onDragOver={e => e.preventDefault()} onDrop={onDropUpload}>
      {path !== '/' && (
        <div className="sftp-item sftp-item-dir" onClick={onGoUp}>
          <span className="sftp-item-icon">📂</span>
          <span className="sftp-item-name">..</span>
        </div>
      )}
      {loading && <div className="sftp-loading">{t('sftp.loading')}</div>}
      {!loading && items.map(item => (
        <div
          key={item.path}
          className={`sftp-item ${item.isDir ? 'sftp-item-dir' : 'sftp-item-file'} ${selected?.path === item.path ? 'selected' : ''} ${renaming?.path === item.path ? 'renaming' : ''}`}
          onClick={() => onItemClick(item)}
          onContextMenu={(e) => onItemContextMenu(e, item)}
        >
          <span className="sftp-item-icon">{item.isDir ? '📁' : '📄'}</span>
          {renaming?.path === item.path ? (
            <input
              className="sftp-rename-input"
              value={renameValue}
              autoFocus
              onClick={e => e.stopPropagation()}
              onChange={e => onRenameValueChange(e.target.value)}
              onBlur={onCommitRename}
              onKeyDown={e => { if (e.key === 'Enter') onCommitRename(); if (e.key === 'Escape') onCancelRename() }}
            />
          ) : (
            <span className="sftp-item-name">{item.name}</span>
          )}
          <span className="sftp-item-size">{item.isDir ? '' : formatSftpSize(item.size)}</span>
          <span className="sftp-item-date">{formatSftpDate(item.mtime)}</span>
        </div>
      ))}
      {!loading && items.length === 0 && (
        <div className="sftp-empty">{t('sftp.empty')}</div>
      )}
    </div>
  )
}
