/** Electron / Chromium 渲染进程扩展（勿加 import，保持全局声明） */

interface File {
  readonly path?: string
}

interface Window {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
}
