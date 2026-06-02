/** IPC 错误码 — formatIpcError / TerminalPanel / ConnectDialog 等 */
export const SSH = {
  zh: {
    connectionFailed: 'SSH 连接失败',
    workerExitUnexpected: 'SSH 工作线程意外退出 ({code})',
  },
  en: {
    connectionFailed: 'SSH connection failed',
    workerExitUnexpected: 'SSH worker exited unexpectedly ({code})',
  },
}

export const TELNET = {
  zh: {
    connectionTimeout: 'Telnet 连接超时',
  },
  en: {
    connectionTimeout: 'Telnet connection timed out',
  },
}

export const SERIAL = {
  zh: {
    moduleUnavailable: 'serialport 模块不可用',
    enumerateFailed: '无法枚举串口设备',
    pathNotInList:
      '串口路径必须是当前系统枚举到的设备。请在连接对话框中刷新或重新打开串口页签后，从列表中选择设备路径',
  },
  en: {
    moduleUnavailable: 'serialport module is not available',
    enumerateFailed: 'Failed to enumerate serial ports',
    pathNotInList:
      'The serial path must be a device from the current system list. Refresh or reopen the Serial tab and pick a path from the list',
  },
}
