# ZTerm 参考手册

供 SKILL.md 引用的详细映射；仅在需要定位文件或理解数据流时阅读。

## 目录结构（精简）

**三分法：`src/` 前端 · `electron/` 后端 · `shared/` 前后端共用**

```
electron/                 # 后端（主进程 + Worker + preload 桥梁）
  main.ts                 应用入口、注册 handlers、trustedSender
  preload.ts              → dist-electron/electron/preload.cjs（esbuild CJS）
  handlers/
    ssh.ts sftp.ts        委托 Worker；SFTP 走 CMD_RESULT 桥接
    telnet.ts serial.ts   主进程直连 TCP/serialport
    credentials.ts        vault 读写 IPC
    app.ts window.ts log.ts
  workers/
    sshSessionWorker.ts   Shell + hostVerifier → HOST_VERIFY
    sftpSessionWorker.ts  SFTP 命令 + 本地路径断言
  lib/                    见 SKILL.md「改代码前先定位」
  i18n/                   主进程 dialog 文案

src/                      # 前端（渲染进程 React）
  components/             React UI
  store/                  sessionStore、settingsStore（localStorage）
  lib/                    渲染进程工具（import、ipc、session、terminal）
  i18n/                   界面翻译
  context/SessionContext.tsx

shared/                   # 前后端共用（类型、契约、纯函数）
  ipc.ts                  IpcOk / IpcFail / IpcError
  zterm-api.d.ts          window.zterm 契约
  sshAlgorithmDefaults.ts
  privateKeyMaterial.ts
  terminalEncoding.ts

tests/                    Vitest，environment: node
tsconfig/                 全部 TS 配置 + README
scripts/build-electron.ts tsc main + esbuild preload
.github/workflows/
  ci.yml                  typecheck + lint + test
  release.yml             手动打包 / GitHub Release
```

## IPC 通道命名

| 前缀 | 模式 | 示例 |
|------|------|------|
| `ssh:` | invoke + send/on | `ssh:connect`, `ssh:data`, `ssh:output` |
| `sftp:` | invoke + Worker CMD | `sftp:list`, `sftp:download` |
| `telnet:` / `serial:` | 同 ssh 流式 | |
| `credentials:` | invoke | `credentials:sync` |
| `app:` / `window:` / `log:` | invoke/send | |

Worker 消息类型见 `electron/types/workerMessages.ts`。

## electron/lib 职责

| 模块 | 作用 |
|------|------|
| `ipcResponse` | ipcOk / ipcFail / createIpcError |
| `workerCmdResult` | Worker CMD_RESULT ↔ IPC |
| `trustedSender` | 限制主窗口 webContents |
| `localPathPolicy` | 收集允许根、validate/assert 路径 |
| `localPathRoots` | `isPathWithinResolvedRoots` 纯函数 |
| `sftpLocalPathRoots` | SFTP 下载/上传路径拼接与校验 |
| `sshKnownHosts` | known_hosts JSON + 弹窗 |
| `hostVerifyMessage` | Worker HOST_VERIFY 桥接 |
| `prepareSshConnectConfig` | 主进程展开私钥路径 |
| `resolvePrivateKeyMaterial` | PEM 或读文件 |
| `sshConnectConfig` | Worker 内 build ssh2 config |
| `terminalEncodingService` | iconv 编码、binary wire |
| `chooseOpenDialog` / `saveFileDialog` | 文件对话框 + 路径策略 |
| `legacyModp2Polyfill` | BoringSSL modp2 兼容 |

## 渲染进程 ↔ 主进程 IPC 消费

- 成功/失败判断：`src/lib/ipc/ipcResponse.ts`（`isIpcSuccess`、`ipcErrorFields`）
- 错误展示：`src/lib/ipc/formatIpcError.ts` + `src/i18n/ipcErrors.ts`

## 导入导出 envelope

- 会话/设置导出：`src/lib/import/downloadJsonExport.ts`
- 解析与校验：`parseImportFile.ts`、`parseSettingsImport.ts`、`normalizeSession.ts`
- 合并策略：`mergeImportedSessions.ts`、`applySessionsImport.ts`

## 数据存储路径

**userData**（因平台而异）：

- Windows: `%APPDATA%/zterm/`
- macOS: `~/Library/Application Support/zterm/`
- Linux: `~/.config/zterm/`

| 文件/键 | 内容 |
|---------|------|
| `zterm-known-hosts.json` | SSH 主机 SHA256 指纹 |
| `zterm-credentials-vault.json` | encrypted 密码/私钥/passphrase |
| `localStorage.zterm_saved_sessions` | 会话元数据（无密钥） |
| `localStorage.zterm_settings` | 应用设置 |

## 开发构建流水线

```
npm run dev
├── dev:renderer     vite :5173
└── dev:electron
    ├── watch:main   tsc -p tsconfig/tsconfig.main.json -w
    │                esbuild preload --watch
    └── nodemon      监视 dist-electron → electron .

npm run build
├── build:main       tsc + esbuild preload
├── vite build       → dist/
└── electron-builder → release/
```

## Preload 为何是 .cjs

根 `package.json` 有 `"type": "module"`，preload 必须 CJS 且输出 `.cjs`，否则 Electron 按 ESM 加载会失败。

## 代码签名（可选）

未配置 Secret 时产物未签名。CI 可注入：

- Windows: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`
- macOS: `MACOS_CSC_LINK`, `MACOS_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`

mac 需 `hardenedRuntime` + entitlements（若启用签名）。

## 质量门禁（CI）

```bash
npm ci && npm run typecheck && npm run lint && npm run test
```

合并前本地应对齐上述命令。
