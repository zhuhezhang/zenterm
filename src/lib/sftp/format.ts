/** 
 * 格式化文件大小
 * @param {number} bytes 文件大小
 * @returns {string} 格式化后的文件大小
 */
export function formatSftpSize(bytes: number | null | undefined): string {
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
export function formatSftpDate(ms: number | null | undefined): string {
  if (!ms) return '-'
  return new Date(ms).toLocaleString()
}
