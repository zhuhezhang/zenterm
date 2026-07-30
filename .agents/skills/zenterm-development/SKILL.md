---
name: zenterm-development
description: >-
  Develop, debug, test, and release the ZenTerm Electron terminal app (SSH/SFTP/Telnet/Serial).
  Use when working in the zenterm repo. Code layout: src/ frontend, electron/ backend,
  shared/ frontend-backend shared. Also for IPC, path policy, Vitest, electron-builder, release.
---

# ZenTerm 开发 Skill

跨平台 Electron 终端：React 渲染进程 + Node 主进程 + Worker 线程（ssh2/SFTP）。连接类型：SSH、SFTP、Telnet、Serial。

## 代码三分法（最重要）

ZenTerm 源码按**前后端 + 共享**划分，改代码前先确认归属：

| 目录 | 角色 | 运行环境 | 说明 |
|------|------|----------|------|
| **`src/`** | **前端** | Electron 渲染进程（Chromium） | React UI、xterm、会话/设置 store、消费 `window.zenterm` IPC |
| **`electron/`** | **后端** | Electron 主进程 + Worker | 主进程 handlers、系统 API（文件/对话框/凭据/串口）、ssh2 Worker |
| **`shared/`** | **前后端共用** | 两侧均可 import | IPC 类型、API 契约、算法默认值、与协议无关的纯工具函数 |

**边界规则：**

- 前端 **不** 直接访问 Node/Electron API；一律经 `electron/preload.ts` → `window.zenterm`
- 后端 **不** 写 React/UI；负责 IPC、文件 I/O、加密存储、网络/串口
- 需要前后端对齐的类型/常量/纯函数放 **`shared/`**，避免在 `src/` 与 `electron/` 各写一份
- `electron/preload.ts` 是桥梁（后端编译、前端调用），逻辑归属后端目录

```
前端 src/  ←—— window.zenterm ——→  preload (electron/)  ←—— IPC ——→  后端 electron/handlers/
                                                                        ↓
                                                                   workers/ (ssh2/SFTP)
         ↑________________________ shared/（类型、契约、共用工具）________________________↑
```

## 架构速览

```
前端 src/              桥梁 electron/preload.ts          后端 electron/
  React + xterm    ←→  contextBridge → window.zenterm  ←→  handlers/*.ts
                                                          ↓ postMessage
                                                    workers/*SessionWorker.ts
```

| 层 | 目录 | 职责 |
|----|------|------|
| 前端 | `src/` | UI、会话/设置 localStorage、IPC 消费 |
| 共用 | `shared/` | IPC 类型、`zenterm-api.d.ts`、算法默认值、编码工具 |
| 后端 | `electron/handlers/` | IPC 注册、弹窗、转发 Worker |
| 后端库 | `electron/lib/` | 路径策略、known_hosts、凭据、SSH 配置、对话框 |
| 后端 Worker | `electron/workers/` | 阻塞式 ssh2 I/O、SFTP 操作 |
| 测试 | `tests/` | Vitest，`environment: node` |

**运行时入口**：`package.json` → `dist-electron/electron/main.js`（非 `electron/main.ts` 源码）。

## 改代码前先定位

| 需求 | 优先改哪里 |
|------|------------|
| UI / 会话列表 / 设置 | **前端** `src/components/`、`src/store/`、`src/context/` |
| 新增 IPC 能力 | **共用** `shared/zenterm-api.d.ts` → **后端** `electron/handlers/`、`electron/preload.ts` → **前端** `src/lib/ipc/` |
| SSH/SFTP 协议逻辑 | **后端** `electron/workers/` + `electron/lib/sshConnectConfig.ts` |
| 本地路径权限 | **后端** `electron/lib/localPathPolicy.ts`、`sftpLocalPathRoots.ts` |
| 主机指纹 | **后端** `electron/lib/sshKnownHosts.ts` |
| 密码/私钥存储 | **后端** `electron/handlers/credentials.ts`（前端不含明文） |
| 导入导出 JSON | **前端** `src/lib/import/` + **共用** envelope 格式 |
| 前后端都要用的类型/工具 | **共用** `shared/` |
| i18n | **前端** `src/i18n/`；主进程 dialog **后端** `electron/i18n/` |

## 硬性约定（违反会编译失败或破坏安全）

### 1. Electron 主进程 ESM import 写 `.js`

`electron/**/*.ts` 内 import  siblings 必须用 **编译后** 扩展名：

```typescript
import { ipcOk } from '../lib/ipcResponse.js'  // ✅
import { ipcOk } from '../lib/ipcResponse'     // ❌
```

### 2. IPC 统一响应形状

类型：`shared/ipc.ts`。主进程用 `electron/lib/ipcResponse.ts`：

- 成功：`ipcOk({ ... })` → `{ success: true, content }`
- 失败：`ipcFail(code, true, params)` 或 `ipcFailFromThrown(e)`
- 已知错误用 **i18n 错误码**（如 `sftp.pathErrors.localDirDenied`），渲染进程 `formatIpcError` 翻译

每个 handler 开头检查 `isTrustedIpcSender(event.sender)`。

### 3. 进程边界

| 操作 | 进程 |
|------|------|
| 读本地私钥文件、路径策略 | 主进程 `prepareSshConnectConfig` / `resolvePrivateKeyMaterial` |
| ssh2 连接、PTY、SFTP | Worker（加载前 `legacyModp2Polyfill`） |
| 主机密钥弹窗 | 主进程 `sshKnownHosts`（Worker 发 `HOST_VERIFY`） |
| 会话/设置持久化 | 渲染进程 `localStorage`（**不含**密钥明文） |
| 密钥明文 | 主进程 `zenterm-credentials-vault.json` + `safeStorage` |

### 4. 路径 alias

- **前端** TS：`@/` → `src/`（`tsconfig/tsconfig.json` + `vite.config.ts`）
- **后端** `electron/` 勿用 `@/` alias
- **共用** `shared/` 用相对路径从两侧 import（如 `../../shared/ipc.js` / `../../shared/ipc`）

### 5. 改动范围

最小 diff；匹配现有命名与注释风格；不擅自加无关抽象或文档。

**迁移 / 拆分代码时**：移动、提取、重命名文件或符号时，须**原样带走**原有 JSDoc、`//` 行内说明与块注释（含 `@param` / `@returns`）；仅当行为或签名变更时才改写注释。禁止为「精简 diff」删掉注释。

### 6. 第三方模块类型（ssh2 等）

- `electron/types/ssh2.d.ts`：ssh2 手写类型，`tsconfig` 中 `paths` 映射 `"ssh2"`；运行时仍用 `node_modules/ssh2`
- `electron/types/shims.d.ts`：其余 ambient 增强（如 `worker_threads`）
- 渲染进程 `tsconfig.json` 与主进程 `tsconfig.main.json` 均须配置 `paths`，因 `moduleResolution: bundler` 不会自动拾取 ambient `declare module`

## 开发与构建

```bash
npm run dev              # Vite + tsc watch + nodemon 重启 Electron
npm run typecheck        # 四套 tsconfig，合并前必跑
npm run lint
npm run test             # vitest run
npm run build:main       # 仅编译主进程 → dist-electron/
npm run build            # 当前平台 electron-builder → release/
```

**主进程热更新链**：改 `electron/**/*.ts` → `tsc -w` → `dist-electron/` → nodemon 重启。若未生效：看终端是否有 recompile；或对 nodemon 输入 `rs`；或 `npm run build:main`。

**TypeScript 配置**：集中在 `tsconfig/`（见 `tsconfig/README.md`）。根 `tsconfig.json` 仅 extends 渲染配置。

## 测试

- 文件：`tests/**/*.test.ts`，镜像 `shared/`、`electron/lib/`、`src/lib/`
- 纯函数直接测；依赖 `electron` 的用 `vi.mock('electron', ...)`（mock 写在 import 被测模块之前）
- 不测 React 组件、不测真实 SSH/串口
- 新增 `electron/lib` 逻辑时优先补对应 `tests/electron/` 用例

## 打包与 Release

- 产物目录：`release/`
- 手动 CI：`.github/workflows/release.yml`
  - `artifacts_only`：按需选平台，仅 Actions Artifacts
  - `github_release_all`：Win x64 + Linux x64 + macOS universal，发布 GitHub Release（需填 `release_tag`）
- 推送/PR 的 `ci.yml` **不**打包

## 持久化（全量 rewrite，非增量）

| 数据 | 位置 |
|------|------|
| 已知主机 | `{userData}/zenterm-known-hosts.json` |
| 凭据 vault | `{userData}/zenterm-credentials-vault.json` |
| 已保存会话 | `localStorage` → `zenterm_saved_sessions` |
| 设置 | `localStorage` → `zenterm_settings` |

JSON 写入使用 `JSON.stringify(data, null, 2)` + `.tmp` 原子替换（主进程两文件）。

## 常见任务清单

**新增 IPC handler**

1. `shared/zenterm-api.d.ts` 扩展 `ZenTermApi`
2. `electron/handlers/*.ts` 注册 `ipcMain.handle`，校验 trusted sender
3. `electron/preload.ts` 暴露给 `window.zenterm`
4. `src/lib/ipc/getZenterm.ts` 或组件内调用
5. 错误码加入 `src/i18n/ipcErrors.ts`（若需 i18n）
6. 补 Vitest（主进程 lib）或渲染 lib 测试

**改 SSH 连接参数**

- 表单/API 类型：`shared/zenterm-api.ts`、`src/types/session.ts`
- 主进程解析私钥：`prepareSshConnectConfig` → `resolvePrivateKeyMaterial`
- Worker 组装 ssh2：`buildSshConnectConfig`

## 延伸阅读

- 目录与安全设计细节：[reference.md](reference.md)
- 仓库文档：`README.zh-CN.md`
- TS 配置：`tsconfig/README.md`
- CI/Release：`.github/workflows/README.md`
