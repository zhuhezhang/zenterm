建议优先改进
2. SSH 主机密钥未校验（MITM 风险）
electron/handlers/ssh.js / sftp.js 里连接配置只有 host/port/用户名/认证等，没有 knownHosts、hostVerifier 或等价逻辑。ssh2 在未严格校验时，用户连到被劫持的 IP 可能无法发现中间人。
建议：维护 known_hosts（或按主机指纹首次确认 + 持久化），对指纹变更给出明确告警或拒绝连接。
