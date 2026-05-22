import { describe, it, expect } from 'vitest'
import {
  SFTP_ERROR,
  isSftpErrorCode,
  createSftpPathError,
  sftpErrorToIpcPayload,
} from '../../shared/sftpErrorCodes.js'

describe('sftpErrorCodes', () => {
  it('recognizes known codes', () => {
    expect(isSftpErrorCode(SFTP_ERROR.LOG_DIR_DENIED)).toBe(true)
    expect(isSftpErrorCode('NOT_A_CODE')).toBe(false)
  })

  it('createSftpPathError carries code and params', () => {
    const err = createSftpPathError(SFTP_ERROR.PATH_ESCAPE_TARGET, { path: '/tmp' })
    expect(err.code).toBe(SFTP_ERROR.PATH_ESCAPE_TARGET)
    expect(err.params).toEqual({ path: '/tmp' })
  })

  it('sftpErrorToIpcPayload maps path errors', () => {
    const err = createSftpPathError(SFTP_ERROR.LOCAL_FILE_PATH_DENIED)
    expect(sftpErrorToIpcPayload(err)).toEqual({
      errorCode: SFTP_ERROR.LOCAL_FILE_PATH_DENIED,
    })
  })

  it('sftpErrorToIpcPayload falls back to message', () => {
    expect(sftpErrorToIpcPayload(new Error('boom'))).toEqual({ error: 'boom' })
  })
})
