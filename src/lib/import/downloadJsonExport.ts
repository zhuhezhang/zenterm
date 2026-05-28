import type { TranslateFn } from '../../types/i18n'
import { buildExportEnvelope } from './parseImportFile'
import { EXPORT_FILENAME_PREFIX } from './constants'
import { alertIpcFailure } from '../ipc/formatIpcError'

type ExportKind = keyof typeof EXPORT_FILENAME_PREFIX

export function buildExportFilename(kind: ExportKind): string {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  return `${EXPORT_FILENAME_PREFIX[kind]}-${date}-${hh}${mm}${ss}.json`
}

export async function downloadJsonExport(
  kind: ExportKind,
  data: unknown,
  t: TranslateFn,
): Promise<void> {
  const payload = buildExportEnvelope(kind, data)
  const jsonText = JSON.stringify(payload, null, 2)
  const filename = buildExportFilename(kind)
  try {
    const res = await window.zterm?.save?.jsonExport(filename, jsonText)
    if (res?.content?.canceled) return
    alertIpcFailure(t, res, 'settings.exportFail')
  } catch (err: unknown) {
    alert(t('settings.exportFail', {
      msg: err instanceof Error ? err.message : String(err),
    }))
  }
}
