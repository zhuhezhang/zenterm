export function translate(
  lang: 'zh' | 'en' | string,
  messagesByLang: { zh: object; en: object },
  path: string,
  params?: Record<string, string | number>,
): string
