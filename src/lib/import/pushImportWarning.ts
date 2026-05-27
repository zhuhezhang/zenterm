/**
 * 向导入警告列表追加一条记录（会话/设置共用）
 * @param {{ code: string, params?: Record<string, string|number> }[]} warnings 导入警告列表
 * @param {string} code 警告代码
 * @param {Record<string, string|number>} [params] 警告参数
 */
export function pushImportWarning(
  warnings: { code: string; params?: Record<string, string | number> }[],
  code: string,
  params?: Record<string, string | number>,
) {
  warnings.push({ code, ...(params ? { params } : {}) })
}
