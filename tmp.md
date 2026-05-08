建议优先改进
2. SSH 主机密钥未校验（MITM 风险）
electron/handlers/ssh.js / sftp.js 里连接配置只有 host/port/用户名/认证等，没有 knownHosts、hostVerifier 或等价逻辑。ssh2 在未严格校验时，用户连到被劫持的 IP 可能无法发现中间人。
建议：维护 known_hosts（或按主机指纹首次确认 + 持久化），对指纹变更给出明确告警或拒绝连接。
7. 开发与 CSP
开发环境 loadURL('http://localhost:5173') 且 openDevTools()，并注入 http://localhost:8097 的 React DevTools，属于正常开发体验，但会放大 XSS/误点恶意页面的后果；发布包应继续走 loadFile 的静态资源。
index.html 里 CSP 含 'unsafe-inline'，对 XSS 的防护有限；在 build 后尽量收紧（nonce/hash）、并明确 connect-src 等，需要与 Vite 产物结构一起设计。
9. IPC 与多窗口/未来导航
当前 IPC 未校验 event.sender 是否为主窗口。单窗口、只加载本地 dist 时风险较低；若以后增加第二个 BrowserWindow、或加载外部 URL，应按 webContents.id 校验调用方，避免任意帧调用 ssh:connect / sftp:* 等高危通道。
