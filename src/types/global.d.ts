/** 
 * Electron / Chromium 渲染进程扩展（勿加 import，保持全局声明）
 *
 * src/types/global.d.ts、vite-env.d.ts、zterm.ts 不用在业务代码里 import 声明文件本身，
 * 只要文件在 include（tsconfig.json 的 include 属性定义）范围内，编译器就会自动合并进“全局类型环境”。
 * 在任意 .tsx 里写 file.path、window.showDirectoryPicker?.()，TS 就知道这些属性存在
 */

/** 文件对象类型扩展 */
interface File {
  readonly path?: string
}

/** 窗口对象类型扩展 */
interface Window {
  /** 显示目录选择器 */
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
}
