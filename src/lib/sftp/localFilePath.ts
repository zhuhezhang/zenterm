/**
 * 沙盒渲染进程不提供 File.path，须通过 preload 的 webUtils.getPathForFile。
 * @param {File} file 文件对象
 * @returns {string} 文件路径
 */
export function getLocalFilePath(file: File): string {
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
