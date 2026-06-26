declare module 'worker_threads' {  // Node.js 内置模块 worker_threads，这里是模块增强（在原有基础上添加备注）
  /** Worker 选项 */
  interface WorkerOptions {
    /** Worker 类型 */
    type?: 'module' | 'commonjs'
    /** Worker 数据 */
    workerData?: unknown
  }
}
