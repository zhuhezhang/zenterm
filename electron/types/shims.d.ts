declare module 'ssh2' {
  import type { EventEmitter } from 'node:events'
  import type { Duplex } from 'node:stream'

  export interface SftpFileAttrs {
    isDirectory(): boolean
    size: number
    mtime: number
    mode: number
  }

  export interface SftpDirEntry {
    filename: Buffer | string
    attrs: SftpFileAttrs
  }

  export interface SftpClient {
    readdir(
      path: string,
      callback: (err: Error | undefined, list?: SftpDirEntry[]) => void,
    ): void
    unlink(path: string, callback: (err: Error | undefined) => void): void
    rmdir(path: string, callback: (err: Error | undefined) => void): void
    mkdir(path: string, callback: (err: Error | undefined) => void): void
    rename(oldPath: string, newPath: string, callback: (err: Error | undefined) => void): void
    fastGet(
      remotePath: string,
      localPath: string,
      options: {
        step?: (transferred: number, chunk: unknown, totalSize: number) => void
      },
      callback: (err: Error | undefined) => void,
    ): void
    fastPut(
      localPath: string,
      remotePath: string,
      options: {
        step?: (transferred: number, chunk: unknown, totalSize: number) => void
      },
      callback: (err: Error | undefined) => void,
    ): void
  }

  export class Client extends EventEmitter {
    connect(config: Record<string, unknown>): void
    shell(
      options: Record<string, unknown>,
      callback: (err: Error | undefined, stream: Duplex & { stderr: Duplex; setWindow: (rows: unknown, cols: unknown) => void }) => void,
    ): void
    sftp(callback: (err: Error | undefined, sftp: SftpClient) => void): void
    end(): void
    on(event: string, listener: (...args: unknown[]) => void): this
  }

  export const utils: {
    parseKey(rawKey: Buffer | string): { type?: string } | Array<{ type?: string }> | null
  }
}

declare module 'worker_threads' {
  interface WorkerOptions {
    /** Node ESM worker */
    type?: 'module' | 'commonjs'
    workerData?: unknown
  }
}
