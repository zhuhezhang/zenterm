# ZTerm

简体中文 · **[English](README.md)** · v3.2.5

ZTerm 是一款基于 **Electron**、**React** 与 **xterm.js** 的跨平台桌面终端模拟器。支持 **SSH**、**SFTP**、**Telnet** 与 **串口（Serial）** 连接，并提供会话保存、层级分组、加密凭据存储，以及无边框自定义界面（深色/浅色主题、中英双语）。

---

## 目录

- [功能特性](#功能特性)
- [键盘快捷键](#键盘快捷键)
- [界面预览](#界面预览)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [开发与质量](#开发与质量)
- [构建与发布](#构建与发布)
- [导入 / 导出格式](#导入--导出格式)
- [安全设计](#安全设计)
- [数据与存储位置](#数据与存储位置)
- [常见问题](#常见问题)
- [许可证](#许可证)

---

## 功能特性

### 连接类型


| 协议         | 说明                                                         |
| ---------- | ---------------------------------------------------------- |
| **SSH**    | 基于 `ssh2` 的交互式 Shell，支持 PTY 尺寸同步、密码或私钥认证，可配置 KEX/加密/MAC 算法 |
| **SFTP**   | 侧边栏远程文件管理：列表、上传、下载、新建目录、重命名、删除；传输进度；本地路径限制在安全用户目录内         |
| **Telnet** | 原生 TCP Telnet 客户端                                          |
| **Serial** | 通过 `serialport` 访问本地串口（波特率、数据位、停止位、校验位）；须从枚举列表中选择端口        |


### 会话管理

- 保存会话：**标签名**、**分组**（层级路径）、连接参数
- **空分组占位**：可先创建文件夹式分组，再向其中添加会话
- **搜索**已保存会话（按名称、主机或串口路径；**Ctrl/Cmd+F** 聚焦搜索框）
- **复制**、**重命名**、**编辑**、**删除**；可配置删除确认
- **导出 / 导入**会话列表（JSON envelope，v1）；可在 **设置** 或 **侧边栏** 中导入
- 连接对话框支持 **直接连接**、**保存并连接**、**仅保存**
- 连接时可弹出 **凭据输入**；支持 **「保存并连接」** 写入加密库

### 终端体验

- **xterm.js**，含 Fit、Web Links、Search 插件，可配置回滚行数（0～500,000）与 **终端字体** 预设（Cascadia Code、JetBrains Mono、Fira Code、Menlo、Consolas、Source Code Pro、Courier New）
- 会话断开或 **初次连接失败** 后，在终端内按 **R** 可 **快速重连**
- **终端内搜索**：增量查找并高亮匹配；支持 **区分大小写**、**全字匹配**、**正则表达式**；上/下跳转；可通过标签右键菜单或 **Ctrl/Cmd+Shift+F** 打开
- **字符编码**：UTF-8、GBK、GB18030、GB2312、Big5、UTF-16 LE、Latin-1（主进程 `iconv-lite`）
- **退格键模式**（按会话）：自动（SSH 发 DEL，Telnet/串口发 BS），或强制 DEL / BS
- **终端交互**：选中复制、右键粘贴（可在设置中关闭）
- **输出高亮**：正则规则着色（内置错误/成功/警告/IP 等默认规则）
- **标签栏**：新建连接、关闭当前/其他/左侧/右侧/全部、清屏、保存终端输出
- **会话日志**：关闭 / 缓冲模式（与屏幕一致）/ 流模式（原始下行，去除 ANSI）；日志目录经路径策略校验

### 界面与国际化

- 自定义 **无边框标题栏**（最小化 / 最大化 / 关闭）；点击 **⚡ ZTerm** 徽标打开 **关于** 对话框
- **深色**、**浅色** 或 **跟随系统** 主题；设置中支持 **实时预览**（保存前生效）
- **界面语言**：简体中文、English 或自动跟随系统
- 可拖拽调整 **侧边栏** 宽度（会话列表与 SFTP 树）
- **设置对话框** 分为「常规」「SSH 与终端」「数据与安全」三个标签页

### 安全相关能力

- 渲染进程启用 **上下文隔离**、**沙箱**，禁用 Node 集成
- IPC 仅接受 **可信** 主窗口来源
- **SSH 主机公钥校验**（类似 known_hosts，`userData/zterm-known-hosts.json`）；首次连接与指纹变更时弹窗确认
- 设置中可标记 **弱 SSH 算法**；默认优先现代 AEAD / EtM，排除常见遗留弱算法
- 可选 **加密凭据库**（系统支持时使用 `safeStorage`）
- 日志与 SFTP 的 **本地路径策略**：用户主目录、文档、下载、桌面、音乐/图片/视频、userData；Windows 上另允许非系统盘根目录（如 `D:\`）

---

## 键盘快捷键

在 ZTerm 窗口获得焦点时生效。macOS 使用 **Cmd**；Windows / Linux 使用 **Ctrl**。


| 快捷键 | 作用 |
| --- | --- |
| **Ctrl/Cmd+F** | 聚焦侧边栏 **已保存会话搜索**（若列表已收起则自动展开） |
| **Ctrl/Cmd+Shift+F** | 打开当前标签页的 **终端内容搜索** |
| **Enter** / **Shift+Enter** | 下一个 / 上一个匹配（终端搜索栏内） |
| **Esc** | 关闭终端搜索栏 |
| **R** | 重连当前终端会话（已断开或初次连接失败时） |

---

## 界面预览

![ZTerm 主界面](docs/images/main.png)

![ZTerm 设置](docs/images/setting.png)

![ZTerm 连接](docs/images/connection.png)

---

## 技术栈


| 层级         | 技术                                 |
| ---------- | ---------------------------------- |
| 桌面壳        | Electron 42                        |
| 语言         | TypeScript                         |
| 界面         | React 19、Vite 8                    |
| 终端         | @xterm/xterm 5、Fit / Web Links / Search 插件 |
| SSH / SFTP | ssh2                               |
| 串口         | serialport 12                      |
| 编码         | iconv-lite                         |
| 测试         | Vitest 3                           |
| 打包         | electron-builder                   |


---

## 项目结构

源码按 **前端 / 后端 / 共用** 三分：

| 目录 | 角色 | 说明 |
|------|------|------|
| **`src/`** | 前端 | React 渲染进程：UI、xterm、localStorage、消费 `window.zterm` |
| **`electron/`** | 后端 | 主进程 + Worker：IPC、文件/对话框、凭据、ssh2/SFTP、串口 |
| **`shared/`** | 前后端共用 | IPC 类型、API 契约、算法默认值、与 UI 无关的纯工具 |

```
zterm/
├── src/                                 # 前端（渲染进程）
│   ├── main.tsx, App.tsx
│   ├── components/                      # 标题栏、侧边栏、终端、SFTP、连接/设置对话框
│   ├── store/                           # sessionStore、settingsStore、credentialsBridge
│   ├── lib/                             # 导入导出、IPC 辅助、会话/终端/设置逻辑
│   ├── hooks/, context/, i18n/, theme/, styles/, types/
│
├── electron/                            # 后端（主进程 + Worker）
│   ├── main.ts                          # 应用入口、注册 handlers
│   ├── preload.ts                       # contextBridge → window.zterm（编译为 preload.cjs）
│   ├── handlers/                        # ssh / sftp / telnet / serial / credentials / app / window / log
│   ├── workers/                         # sshSessionWorker、sftpSessionWorker
│   ├── lib/                             # IPC 响应、路径策略、known_hosts、SSH 配置、文件对话框等
│   ├── i18n/                            # 主进程原生对话框文案
│   └── types/
│
├── shared/                              # 前后端共用（类型、契约、纯函数）
│   ├── ipc.ts, zterm-api.d.ts
│   ├── sshAlgorithmDefaults.ts, terminalEncoding.ts, privateKeyMaterial.ts, …
│
├── tests/                               # Vitest 单元测试（tests/**/*.test.ts）
├── tsconfig/                            # TypeScript 配置（见 tsconfig/README.md）
├── scripts/                             # build-electron.ts、after-pack.cjs
├── .github/workflows/                   # ci.yml（自动检查）、release.yml（手动打包）
├── docs/images/                         # README 截图
├── build/                               # 应用图标
├── .npmrc                               # npm 配置文件
├── index.html, vite.config.ts, vitest.config.ts, eslint.config.ts
├── tsconfig.json                        # IDE 入口，extends tsconfig/tsconfig.json
└── package.json
```

**运行时数据流（简图）：**

```
前端 src/（React / xterm）
    │  window.zterm.*（preload.cjs）
    ▼
后端 electron/（handlers + lib）
    │  Worker 线程（SSH / SFTP）
    ▼
远程主机 / 本地串口 / 系统钥匙串（safeStorage）

shared/* ── 前后端共用（IPC 类型、算法、编码、错误码等）
```

**开发编译产物：** 后端 TypeScript 编译到 `dist-electron/`；前端 Vite 构建到 `dist/`。Electron 实际加载的是编译后的 `dist-electron/electron/main.js`，而非 `electron/*.ts` 源码。

---

## 环境要求

- **Node.js** 18+（建议 LTS；CI 使用 Node 22）
- **npm** 9+
- **原生模块编译环境**（Serial 等依赖需要）：
  - **macOS**：Xcode Command Line Tools
  - **Windows**：Visual Studio Build Tools、Python（供 `node-gyp` 使用）
  - **Linux**：`build-essential`、`libudev-dev`

---

## 快速开始

```bash
# GitHub
git clone https://github.com/zhuhezhang/zterm.git
cd zterm

# 或 Gitee
# git clone https://gitee.com/zhuhezhang/zterm.git
# cd zterm

npm install
npm run dev
```

将启动 **Vite**（端口 **5173**）与 **Electron** 开发链：`electron/` 经 `tsc -w` 编译到 `dist-electron/`，nodemon 监视产物并重启主进程；`src/` 由 Vite 热更新。

| 脚本 | 说明 |
| --- | --- |
| `npm run dev:silent` | 同 `dev`，屏蔽 Electron 安全警告 |
| `npm run dev:renderer` | 仅 Vite |
| `npm run dev:electron` | 仅 Electron（需 Vite 已在 5173 运行） |
| `npm run build:main` | 仅编译后端 → `dist-electron/` |

---

## 开发与质量

合并前建议本地执行（与 GitHub Actions `ci.yml` 一致）：

```bash
npm run typecheck   # 四套 tsconfig：前端、后端、preload、工具链
npm run lint
npm run test        # Vitest，tests/**/*.test.ts
```

| 脚本 | 说明 |
| --- | --- |
| `npm run test:watch` | 监听模式跑测试 |
| `npm run test:coverage` | 覆盖率（src/lib、shared、electron/lib） |

---

## 构建与发布

```bash
npm run build              # 当前平台：NSIS + 便携版 + zip（Windows）等 → release/
npm run build:win:x64      # 仅 Windows x64
npm run build:linux:x64    # 仅 Linux x64
npm run build:mac:universal
```

**GitHub Actions**（见 `.github/workflows/README.md`）：

- **`ci.yml`**：push/PR 自动跑 typecheck、lint、test
- **`release.yml`**：手动触发打包；可选 `github_release_all` 一次性打 Win+Linux+macOS 并发布 GitHub Release


---

## 导入 / 导出格式

导出的 **会话** 与 **设置** 使用带版本号的 JSON envelope（单文件上限 **8 MB**）：

```json
{
  "ztermExport": "sessions",
  "version": 1,
  "exportedAt": "Mon May 19 2026 ...",
  "data": [ /* 会话对象数组或设置对象 */ ]
}
```

- `ztermExport` 须为 `"sessions"` 或 `"settings"`（类型不匹配会报错）。
- `version` 须为 `1`。
- 导入设置时会剥离未知键；无效会话条目会跳过并在完成后提示统计。
- 单次会话导入上限 **99999** 条（见 `src/lib/import/constants.ts`）。

---

## 安全设计

1. **进程隔离**：网络与文件 IO 在主进程及 Worker 中执行；渲染进程仅通过 `preload.cjs` 白名单 IPC 调用。
2. **可信 IPC**：窗口控制、日志、凭据等接口拒绝非主窗口来源的调用。
3. **SSH 中间人防护**：记录主机公钥；未知或变更指纹需用户在原生对话框中确认。
4. **算法策略**：默认优先现代 AEAD 与 EtM MAC；为兼容旧设备仍可选遗留算法，界面会标注弱算法。
5. **路径沙箱**：会话日志与 SFTP 本地路径须落在允许的用户目录、`userData` 或（Windows）非系统盘根目录内；拒绝时返回结构化 `SFTP_ERROR` 错误码，由渲染进程映射为 i18n 提示。
6. **串口安全**：仅允许连接 `listPorts` 枚举结果中的路径，降低任意设备打开风险。

本应用为日常运维工具，不能替代完整安全审计。在生产环境保存密钥前请评估自身威胁模型。

---

## 数据与存储位置


| 数据          | 位置                                              |
| ----------- | ----------------------------------------------- |
| 已保存会话（不含密钥） | `localStorage` → `zterm_saved_sessions`         |
| 空分组占位符      | `localStorage` → `__zterm_group_placeholders__` |
| 应用设置        | `localStorage` → `zterm_settings`               |
| SSH 已知主机    | `{userData}/zterm-known-hosts.json`（格式化 JSON，全量写入） |
| 加密凭据        | `{userData}/zterm-credentials-vault.json` + 系统 `safeStorage` |
| 会话日志        | 用户配置目录或 `下载/zterm-session-log/`                 |

上述 localStorage 由 Chromium 管理；`zterm-known-hosts.json` 与 `zterm-credentials-vault.json` 仅在对应操作（信任主机、同步凭据等）时重写整文件。


典型 **userData** 路径：

- **macOS**：`~/Library/Application Support/zterm/`
- **Windows**：`%APPDATA%\zterm\`
- **Linux**：`~/.config/zterm/`

---

## 常见问题


| 现象                                                                                                                 | 处理建议                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm install` 在 `serialport` 处失败                                                                                   | 安装对应平台编译工具；Linux 需 `libudev-dev`                                                                                                                                                                       |
| SSH 算法协商失败                                                                                                         | 打开 **设置 → SSH 与终端 → 算法**，勾选服务器所需的遗留 KEX/加密                                                                                                                                                             |
| 中文乱码                                                                                                               | 将会话编码设为 **GBK** 或 **GB18030**                                                                                                                                                                          |
| SFTP 提示路径不允许                                                                                                       | 选择下载/文档/用户主目录下的路径，勿选系统目录                                                                                                                                                                               |
| 串口列表为空                                                                                                             | 点击 **刷新**；Linux 用户需加入 `dialout` 组                                                                                                                                                                      |
| 每次连接都提示主机密钥                                                                                                        | 检查 `userData` 是否可写；避免只读配置环境运行                                                                                                                                                                          |
| 导入失败 / 文件类型错误                                                                                                      | 确认使用正确的导出文件（会话 vs 设置）；单文件不超过 8 MB                                                                                                                                                                      |
| 修改 `electron/` 后未生效                                                                                                 | 确认 `npm run dev` 在跑且 `tsc -w` 有重编译；或对 nodemon 输入 `rs`；或 `npm run build:main`                                                                                                                                  |
| Windows 便携版 `ZTerm x.x.x.exe` 在资源管理器中图标异常，但右键 **属性** 里图标正常；`release\win-unpacked\ZTerm.exe` 与 `ZTerm Setup x.x.x.exe` 显示正常 | 图标已写入 exe，多为 Windows Shell **图标缓存**（反复用同名覆盖打包时常见）。将文件复制并改名为 `ZTerm-test.exe` 可快速验证；若改名后正常，结束并重启 `explorer.exe`，删除 `%LocalAppData%\Microsoft\Windows\Explorer\` 下的 `iconcache`*、`thumbcache*` 后再打开资源管理器 |
| **Ctrl/Cmd+Shift+F** 无法打开终端内容搜索 | 若与输入法「简体/繁体切换」等快捷键相同，焦点在终端内时会被输入法优先拦截。可关闭或修改输入法的对应快捷键，或在标签页上 **右键 → 搜索终端内容** 打开搜索框 |
| `npm run build:mac` 等在 Electron 42 下因 `cpu-features` / `nan` 编译失败 | `package.json` 的 `build.npmRebuild` 已设为 `false`，跳过打包时的原生模块重编译。`serialport` 使用 N-API 预编译包；`cpu-features` 为 `ssh2` 可选依赖，不影响 SSH 功能。待 [nodejs/nan#1015](https://github.com/nodejs/nan/pull/1015) 发布后，可恢复为 `true` 以启用 ssh2 原生加速 |


---

## 许可证

[MIT 许可证](LICENSE) — Copyright © 2026 [zhuhezhang](https://github.com/zhuhezhang)

---

**English documentation:** [README.md](README.md)