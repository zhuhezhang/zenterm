/** SFTP 本地路径策略错误文案（主进程 / Worker IPC 使用） */
export const SFTP = {
  zh: {
    pathKind: {
      download: '下载',
      upload: '上传',
      sftp: 'SFTP',
    },
    pathErrors: {
      allowedRootsHint:
        '路径须位于用户主目录、文稿/文档、下载、桌面、图片、音乐、影片、本应用用户数据目录下。Windows 上还可使用系统盘（通常为 C 盘）以外的整盘路径',
      localFileDenied: '{kindLabel}本地路径被拒绝：{hint}',
      localDirDenied: '{kindLabel}本地目录被拒绝：{hint}',
      invalidFilename: '{kindLabel}：非法文件名',
      pathEscapeTarget: '{kindLabel}：路径跳出目标目录',
      logDirDenied: '日志目录被拒绝：{hint}',
    },
  },
  en: {
    pathKind: {
      download: 'Download',
      upload: 'Upload',
      sftp: 'SFTP',
    },
    pathErrors: {
      allowedRootsHint:
        "Path must be under your home, Documents, Downloads, Desktop, Pictures, Music, Movies, this app's user data folder, or (on Windows) any drive letter other than the system drive (usually C:)",
      localFileDenied: '{kindLabel} local file path denied: {hint}',
      localDirDenied: '{kindLabel} local folder denied: {hint}',
      invalidFilename: '{kindLabel}: invalid file name',
      pathEscapeTarget: '{kindLabel}: path escapes target folder',
      logDirDenied: 'Log folder denied: {hint}',
    },
  },
}
