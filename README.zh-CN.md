# ZTerm

简体中文 · **[English](README.md)**

ZTerm 是一款基于 **Electron**、**React** 与 **xterm.js** 的跨平台桌面终端模拟器。支持 **SSH**、**SFTP**、**Telnet** 与 **串口（Serial）** 连接，并提供会话保存、分组管理、加密凭据存储，以及无边框自定义界面（深色/浅色主题、中英双语）。

---

## 目录

- [功能特性](#功能特性)
- [界面预览](#界面预览)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [使用指南](#使用指南)
- [设置项说明](#设置项说明)
- [安全设计](#安全设计)
- [数据与存储位置](#数据与存储位置)
- [常见问题](#常见问题)
- [许可证](#许可证)

---

## 功能特性

### 连接类型

| 协议 | 说明 |
|------|------|
| **SSH** | 基于 `ssh2` 的交互式 Shell，支持 PTY 尺寸同步、密码或私钥认证，可配置 KEX/加密/MAC 算法 |
| **SFTP** | 侧边栏远程文件管理：列表、上传、下载、新建目录、重命名、删除；传输进度；本地路径限制在安全用户目录内 |
| **Telnet** | 原生 TCP Telnet 客户端 |
| **Serial** | 通过 `serialport` 访问本地串口（波特率、数据位、停止位、校验位）；须从枚举列表中选择端口 |

### 会话管理

- 保存会话：**标签名**、**分组**（层级路径）、连接参数
- **搜索**已保存会话（按名称、主机或串口路径）
- **复制**、**重命名**、**编辑**、**删除**；可配置删除确认
- **导出 / 导入**会话列表（JSON）
- 连接时可弹出 **凭据输入**；支持 **「保存并连接」** 写入加密库

### 终端体验

- **xterm.js**，含 Fit、Web Links 插件，可配置回滚行数（0～500,000）
- **字符编码**：UTF-8、GBK、GB18030、GB2312、Big5、UTF-16 LE、Latin-1（主进程 `iconv-lite`）
- **退格键模式**：自动（SSH 发 DEL，Telnet/串口发 BS），或强制 DEL / BS
- **终端交互**：选中复制、右键粘贴（可在设置中关闭）
- **输出高亮**：正则规则着色（内置错误/成功/警告/IP 等默认规则）
- **标签栏**：新建连接、关闭当前/其他/左侧/右侧/全部、清屏、保存终端输出
- **会话日志**：关闭 / 缓冲模式（与屏幕一致）/ 流模式（原始下行，去除 ANSI）

### 界面与国际化

- 自定义 **无边框标题栏**（最小化 / 最大化 / 关闭）
- **深色**、**浅色** 或 **跟随系统** 主题
- **界面语言**：简体中文、English 或自动跟随系统
- 可拖拽调整 **侧边栏** 宽度（会话列表与 SFTP 树）

### 安全相关能力

- 渲染进程启用 **上下文隔离**、**沙箱**，禁用 Node 集成
- IPC 仅接受 **可信** 主窗口来源
- **SSH 主机公钥校验**（类似 known_hosts，`userData/zterm-known-hosts.json`）；首次连接与指纹变更时弹窗确认
- 设置中可标记 **弱 SSH 算法**；默认优先现代 AEAD / EtM，排除常见遗留弱算法
- 可选 **加密凭据库**（系统支持时使用 `safeStorage`）
- 日志与 SFTP 的 **本地路径策略**：仅允许用户主目录、文档、下载、桌面、userData 等范围

---

## 界面预览

![ZTerm 主界面](docs/images/main.png)
![ZTerm 设置界面](docs/images/setting.png)
![ZTerm 连接界面](docs/images/connection.png)

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Electron 42 |
| 界面 | React 18、Vite 8 |
| 终端 | @xterm/xterm 5、Fit 插件、Web Links 插件 |
| SSH / SFTP | ssh2 |
| 串口 | serialport 12 |
| 编码 | iconv-lite |
| 打包 | electron-builder |

---

## 项目结构

```
zterm/
├── electron/                 # 主进程
│   ├── main.js               # 窗口、IPC、日志写入、路径策略
│   ├── preload.cjs           # contextBridge API（window.zterm）
│   ├── handlers/             # ssh、sftp、telnet、serial、credentials
│   ├── workers/              # sshSessionWorker、sftpSessionWorker
│   └── lib/                  # 已知主机、路径策略、可信发送方
├── src/                      # 渲染进程（React）
│   ├── App.jsx
│   ├── components/           # 终端、侧边栏、SFTP、对话框等
│   ├── store/                # 会话、设置、凭据桥接
│   ├── i18n/                 # 中英文文案
│   └── styles/
├── shared/                   # terminalEncodings、sshAlgorithmDefaults
├── index.html
├── vite.config.js
└── package.json
```

---

## 环境要求

- **Node.js** 18+（建议使用 LTS）
- **npm** 9+
- **原生模块编译环境**（Serial 等依赖需要）：
  - **macOS**：Xcode Command Line Tools
  - **Windows**：Visual Studio Build Tools、Python（供 `node-gyp` 使用）
  - **Linux**：`build-essential`、`libudev-dev`

---

## 快速开始

```bash
git clone https://github.com/zhuhezhang/zterm(或者 git clone https://gitee.com/zhuhezhang/zterm)
cd zterm
npm install
npm run dev
```

将启动 Vite 开发服务（端口 **5173**），并以 nodemon 监听 `electron/` 目录后启动 Electron。

---

## 使用指南

### 新建连接

1. 在侧边栏或标签栏点击 **新建连接**。
2. 选择 **SSH**、**Telnet** 或 **Serial**。
3. 填写主机/端口（或从刷新后的列表选择串口）、标签、分组、编码与认证信息。
4. SSH 可勾选 **启用 SFTP**，在同一会话侧边栏显示远程文件。
5. **直接连接**（不强制写库）或 **保存并连接**（写入已保存会话；若开启凭据库可能保存密码/密钥）。

### 已保存会话

- 使用 **分组** 组织（如 `生产环境/Web`）。分组名不得包含：`\ / : * ? " < > |`
- 右键菜单：连接、编辑、复制、删除等。
- 搜索框可按会话名、主机或串口路径过滤。

### SFTP

- 在 SSH 连接对话框中按会话启用。
- 支持按钮上传与拖拽上传；可下载文件或整个目录。
- 本地路径须在允许的用户目录范围内（见 [安全设计](#安全设计)）。

### 终端标签

- 支持多标签，每个标签独立会话。
- 右键：多种关闭方式、清屏、保存输出。
- SSH 在窗口尺寸变化时会同步调整远端 PTY 大小。

### 凭据

- 在 **设置 → 安全** 中开启 **「保存敏感凭据到加密存储」** 后，密码与私钥可写入系统加密存储。
- 使用凭据库时，**localStorage 中的会话 JSON 不含明文密钥**。
- 设置中可在支持时 **清除全部凭据库条目**。

---

## 设置项说明

| 设置 | 说明 |
|------|------|
| **应用主题** | `dark` / `light` / `auto`（跟随系统） |
| **界面语言** | `zh` / `en` / `auto` |
| **终端回滚行数** | 视口上方保留的历史行数（默认 20,000） |
| **终端交互** | 选中复制、右键粘贴 |
| **日志模式** | `none` 关闭 / `buffer` 缓冲 / `stream` 流式 |
| **日志目录** | 默认：`下载目录/zterm-session-log` |
| **高亮规则** | 正则、大小写、颜色 |
| **SSH 算法** | KEX、主机密钥、加密、HMAC 优先级列表 |
| **保存凭据到加密存储** | 使用 `safeStorage` |
| **删除确认** | 删除会话/分组时是否弹窗 |
| **侧边栏宽度** | 布局宽度持久化 |

可在设置对话框中 **导入/导出** 设置与会话 JSON。

---

## 安全设计

1. **进程隔离**：网络与文件 IO 在主进程及 Worker 中执行；渲染进程仅通过 `preload.cjs` 白名单 IPC 调用。
2. **可信 IPC**：窗口控制、日志、凭据等接口拒绝非主窗口来源的调用。
3. **SSH 中间人防护**：记录主机公钥；未知或变更指纹需用户在原生对话框中确认。
4. **算法策略**：默认优先现代 AEAD 与 EtM MAC；为兼容旧设备仍可选遗留算法，界面会标注弱算法。
5. **路径沙箱**：会话日志与 SFTP 本地读写路径须解析到标准用户目录或应用 `userData` 之下。
6. **串口安全**：仅允许连接 `listPorts` 枚举结果中的路径，降低任意设备打开风险。

本应用为日常运维工具，不能替代完整安全审计。在生产环境保存密钥前请评估自身威胁模型。

---

## 数据与存储位置

| 数据 | 位置 |
|------|------|
| 已保存会话（不含密钥） | 浏览器 `localStorage`（`zterm_sessions`） |
| 应用设置 | `localStorage`（`zterm_settings`） |
| SSH 已知主机 | `{userData}/zterm-known-hosts.json` |
| 加密凭据 | 系统钥匙串（Electron `safeStorage`，可用时） |
| 会话日志 | 用户配置目录或 `下载/zterm-session-log/` |

典型 **userData** 路径：

- **macOS**：`~/Library/Application Support/zterm/`
- **Windows**：`%APPDATA%\zterm\`
- **Linux**：`~/.config/zterm/`

---

## 常见问题

| 现象 | 处理建议 |
|------|----------|
| `npm install` 在 `serialport` 处失败 | 安装对应平台编译工具；Linux 需 `libudev-dev` |
| SSH 算法协商失败 | 打开 **设置 → SSH 算法**，勾选服务器所需的遗留 KEX/加密 |
| 中文乱码 | 将会话编码设为 **GBK** 或 **GB18030** |
| SFTP 提示路径不允许 | 选择下载/文档/用户主目录下的路径，勿选系统目录 |
| 串口列表为空 | 点击 **刷新**；Linux 用户需加入 `dialout` 组 |
| 每次连接都提示主机密钥 | 检查 `userData` 是否可写；避免只读配置环境运行 |

---

## 许可证

MIT 许可证 — Copyright © zhuhezhang

---

**English documentation:** [README.md](README.md)
