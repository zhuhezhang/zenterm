import type { TranslateFn } from '../../types/i18n'
import type { SessionImportWarning } from '../../types/import'
import { pushImportWarning } from '../import/pushImportWarning'
import { SESSION_GROUP_LABEL_ERROR_KEYS } from './defaults'

export function pushSessionImportWarning(
  warnings: SessionImportWarning[],
  code: string,
  params?: Record<string, string | number>,
): void {
  pushImportWarning(warnings, code, params)
}

function resolveConnectFieldLabel(t: TranslateFn, fieldKey: string): string {
  const labelKey = `connect.${fieldKey}`
  const label = t(labelKey)
  return label !== labelKey ? label : fieldKey
}

function formatSessionSkipReason(t: TranslateFn, reason: string): string {
  const connectKey =
    SESSION_GROUP_LABEL_ERROR_KEYS[reason as keyof typeof SESSION_GROUP_LABEL_ERROR_KEYS]
  if (connectKey) {
    const msg = t(connectKey)
    if (msg !== connectKey) return msg
  }
  const key = `settings.importSessionWarnings.skipReason.${reason}`
  const msg = t(key)
  return msg !== key ? msg : reason
}

export function formatSessionImportWarning(
  t: TranslateFn,
  warning: SessionImportWarning,
): string {
  const params: Record<string, string | number> = { ...(warning.params || {}) }
  if (typeof params.field === 'string') {
    params.fieldLabel = resolveConnectFieldLabel(t, params.field)
  }
  if (typeof params.reason === 'string') {
    params.reasonText = formatSessionSkipReason(t, params.reason)
  }
  if (warning.code === 'mergeDuplicateLabel') {
    const g = String(params.group ?? '').trim()
    params.group = g || t('settings.importSessionWarnings.ungrouped')
  }
  const key = `settings.importSessionWarnings.${warning.code}`
  const msg = t(key, params)
  return msg !== key ? msg : warning.code
}

export function formatSessionImportWarnings(
  t: TranslateFn,
  warnings: SessionImportWarning[],
): string {
  if (!warnings?.length) return ''
  return warnings.map((w) => formatSessionImportWarning(t, w)).join('\n')
}
