/**
 * 按点路径查表并替换 {name} 占位符
 * @param lang 语言
 * @param messagesByLang 各语言嵌套文案对象
 * @param path 点路径, 如 sftp.pathErrors.localFileDenied
 * @param [params] 参数（如{name: '张三'}）
 * @returns 翻译后的文案
 */
export function translate(
  lang: 'zh' | 'en' | string,
  messagesByLang: { zh: object; en: object },
  path: string,
  params?: Record<string, string | number>,
): string
