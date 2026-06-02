declare module 'ssh2' {  // Node.js 内置模块 ssh2，这里是模块增强（可理解成继承）
  import type { EventEmitter } from 'node:events'
  import type { Duplex } from 'node:stream'

  /** SFTP 文件属性 */
  export interface SftpFileAttrs {
    /** 是否是目录 */
    isDirectory(): boolean
    /** 文件大小 */
    size: number
    /** 修改时间 */
    mtime: number
    /** 模式 */
    mode: number
  }

  /** SFTP 目录项 */
  export interface SftpDirEntry {
    /** 文件名 */
    filename: Buffer | string
    /** 文件属性 */
    attrs: SftpFileAttrs
  }

  /** SFTP 客户端 */
  export interface SftpClient {
    /** 
     * 读取目录
     * @param path 目录路径
     * @param callback 回调函数，参数为错误和目录项列表
     */
    readdir(path: string, callback: (err: Error | undefined, list?: SftpDirEntry[]) => void): void
    /**
     * 删除文件
     * @param path 文件路径
     * @param callback 回调函数，参数为错误
     */
    unlink(path: string, callback: (err: Error | undefined) => void): void
    /**
     * 删除目录
     * @param path 目录路径
     * @param callback 回调函数，参数为错误
     */
    rmdir(path: string, callback: (err: Error | undefined) => void): void
    /**
     * 创建目录
     * @param path 目录路径
     * @param callback 回调函数，参数为错误
     */
    mkdir(path: string, callback: (err: Error | undefined) => void): void
    /**
     * 重命名文件
     * @param oldPath 旧文件路径
     * @param newPath 新文件路径
     * @param callback 回调函数，参数为错误
     */
    rename(oldPath: string, newPath: string, callback: (err: Error | undefined) => void): void
    /**
     * 快速下载文件
     * @param remotePath 远程文件路径
     * @param localPath 本地文件路径
     * @param options 选项，包含进度回调函数
     * @param callback 回调函数，参数为错误
     */
    fastGet(
      remotePath: string,
      localPath: string,
      options: {
        step?: (transferred: number, chunk: unknown, totalSize: number) => void
      },
      callback: (err: Error | undefined) => void,
    ): void
    /**
     * 快速上传文件
     * @param localPath 本地文件路径
     * @param remotePath 远程文件路径
     * @param options 选项，包含进度回调函数
     * @param callback 回调函数，参数为错误
     */
    fastPut(
      localPath: string,
      remotePath: string,
      options: {
        step?: (transferred: number, chunk: unknown, totalSize: number) => void
      },
      callback: (err: Error | undefined) => void,
    ): void
  }

  /** SSH 客户端 */
  export class Client extends EventEmitter {
    /** 连接 */
    connect(config: Record<string, unknown>): void
    /** 打开 shell */
    shell(
      options: Record<string, unknown>,
      callback: (err: Error | undefined, stream: Duplex & { stderr: Duplex; setWindow: (rows: unknown, cols: unknown) => void }) => void,
    ): void
    /** 创建 SFTP 客户端 */
    sftp(callback: (err: Error | undefined, sftp: SftpClient) => void): void
    /** 关闭连接 */
    end(): void
    /** 监听事件 */
    on(event: string, listener: (...args: unknown[]) => void): this
  }

  /** SSH 工具 */
  export const utils: {
    /** 解析密钥 */
    parseKey(rawKey: Buffer | string): { type?: string } | Array<{ type?: string }> | null
  }
}

declare module 'worker_threads' {  // Node.js 内置模块 worker_threads，这里是模块增强（可理解成继承）
  /** Worker 选项 */
  interface WorkerOptions {
    /** Worker 类型 */
    type?: 'module' | 'commonjs'
    /** Worker 数据 */
    workerData?: unknown
  }
}
