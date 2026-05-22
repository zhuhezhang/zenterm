/** SSH 已知主机公钥确认对话框文案（主进程 dialog 使用）../lib/sshKnownHosts.js */
export const SSH_KNOWN_HOSTS = {
  zh: {
    changed: {
      title: 'SSH 主机密钥已变更',
      message: '与本地已保存的指纹不一致，可能存在中间人攻击。',
      detail: '主机: {host}\n密钥类型: {keyType}\n已保存 SHA256: {savedSha256}\n当前 SHA256: {currentSha256}',
      disconnect: '断开连接',
      trustNew: '信任新密钥并继续',
    },
    unknown: {
      title: '未知 SSH 主机',
      message: '尚未记录该主机的公钥指纹，是否信任并保存？',
      detail: '主机: {host}\n密钥类型: {keyType}\nSHA256: {sha256}',
      cancel: '取消',
      trustSave: '信任并保存',
    },
  },
  en: {
    changed: {
      title: 'SSH host key changed',
      message: 'The fingerprint does not match the saved record. This may indicate a man-in-the-middle attack.',
      detail: 'Host: {host}\nKey type: {keyType}\nSaved SHA256: {savedSha256}\nCurrent SHA256: {currentSha256}',
      disconnect: 'Disconnect',
      trustNew: 'Trust new key and continue',
    },
    unknown: {
      title: 'Unknown SSH host',
      message: 'This host key is not in your saved fingerprints. Trust and save it?',
      detail: 'Host: {host}\nKey type: {keyType}\nSHA256: {sha256}',
      cancel: 'Cancel',
      trustSave: 'Trust and save',
    },
  },
}
