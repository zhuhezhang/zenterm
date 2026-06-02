import { describe, it, expect } from 'vitest'
import { ipcFromWorkerCmdResult } from '../../electron/lib/workerCmdResult'

describe('ipcFromWorkerCmdResult', () => {
  it('maps worker success with payload to ipcOk', () => {
    expect(
      ipcFromWorkerCmdResult({ type: 'CMD_RESULT', reqId: 1, success: true, items: [{ name: 'a', type: '-' }] }),
    ).toEqual({ success: true, content: { items: [{ name: 'a', type: '-' }] } })
  })

  it('maps worker failure to ipcFail', () => {
    expect(
      ipcFromWorkerCmdResult({
        type: 'CMD_RESULT',
        reqId: 2,
        success: false,
        error: 'sftp.noSession',
        errorParams: { x: 1 },
      }),
    ).toEqual({
      success: false,
      errorKnown: true,
      content: { error: 'sftp.noSession', errorParams: { x: 1 } },
    })
  })
})
