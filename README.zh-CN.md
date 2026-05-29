# ZTerm

简体中文 · **[English](README.md)** · v1.2.3

ZTerm 是一款基于 **Electron**、**React** 与 **xterm.js** 的跨平台桌面终端模拟器。支持 **SSH**、**SFTP**、**Telnet** 与 **串口（Serial）** 连接，并提供会话保存、层级分组、加密凭据存储，以及无边框自定义界面（深色/浅色主题、中英双语）。

---

## 目录

- [功能特性](#功能特性)
- [界面预览](#界面预览)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
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
- **搜索**已保存会话（按名称、主机或串口路径）
- **复制**、**重命名**、**编辑**、**删除**；可配置删除确认
- **导出 / 导入**会话列表（JSON envelope，v1）；可在 **设置** 或 **侧边栏** 中导入
- 连接对话框支持 **直接连接**、**保存并连接**、**仅保存**
- 连接时可弹出 **凭据输入**；支持 **「保存并连接」** 写入加密库

### 终端体验

- **xterm.js**，含 Fit、Web Links 插件，可配置回滚行数（0～500,000）
- **字符编码**：UTF-8、GBK、GB18030、GB2312、Big5、UTF-16 LE、Latin-1（主进程 `iconv-lite`）
- **退格键模式**（按会话）：自动（SSH 发 DEL，Telnet/串口发 BS），或强制 DEL / BS
- **终端交互**：选中复制、右键粘贴（可在设置中关闭）
- **输出高亮**：正则规则着色（内置错误/成功/警告/IP 等默认规则）
- **标签栏**：新建连接、关闭当前/其他/左侧/右侧/全部、清屏、保存终端输出
- **会话日志**：关闭 / 缓冲模式（与屏幕一致）/ 流模式（原始下行，去除 ANSI）；日志目录经路径策略校验

### 界面与国际化

- 自定义 **无边框标题栏**（最小化 / 最大化 / 关闭）
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

## 界面预览

ZTerm 主界面
ZTerm 设置界面
ZTerm 连接界面

---

## 技术栈


| 层级         | 技术                                 |
| ---------- | ---------------------------------- |
| 桌面壳        | Electron 42                        |
| 界面         | React 18、Vite 8                    |
| 终端         | @xterm/xterm 5、Fit 插件、Web Links 插件 |
| SSH / SFTP | ssh2                               |
| 串口         | serialport 12                      |
| 编码         | iconv-lite                         |
| 打包         | electron-builder                   |


---

## 项目结构

```
zterm/
├── electron/                            # 主进程（Node.js + Electron API）
│   ├── main.js                          # 应用入口：无边框窗口、IPC 路由、会话日志、界面语言同步
│   ├── preload.cjs                      # contextBridge → window.zterm（SSH/SFTP/Telnet/串口/凭据/窗口/日志）
│   ├── handlers/                        # 由 main.js 注册的 IPC 处理程序
│   │   ├── ssh.js                       # SSH 连接/断开、PTY 读写、resize；委托 Worker 执行
│   │   ├── sftp.js                      # SFTP 列表/上传/下载/建目录/重命名/删除；委托 Worker 执行
│   │   ├── telnet.js                    # Telnet TCP 连接与字节流 I/O
│   │   ├── serial.js                    # 串口枚举/打开/写入；路径须与 listPorts 白名单一致
│   │   └── credentials.js               # safeStorage 凭据库：get/sync/remove/duplicate/clearAll
│   ├── workers/                         # Worker 线程（将阻塞的 ssh2 I/O 移出主循环）
│   │   ├── sshSessionWorker.js          # 每个会话独立的 SSH Shell Worker
│   │   └── sftpSessionWorker.js         # 每个会话独立的 SFTP Worker（本地路径校验走 shared 根目录逻辑）
│   ├── i18n/
│   │   └── knownHosts.js                # SSH 主机公钥确认对话框文案（主进程 dialog，中英双语）
│   └── lib/                             # 主进程公共工具
│       ├── trustedSender.js             # 仅允许已注册主窗口发起的 IPC
│       ├── localPathPolicy.js           # 解析允许根目录；校验日志/SFTP 路径；结构化 SFTP 错误
│       ├── sftpLocalPathRoots.js        # 纯路径包含性检查（主进程与 Worker 复用，由 localPathPolicy 再导出）
│       ├── sshKnownHosts.js             # SSH 主机公钥持久化与校验（zterm-known-hosts.json）
│       ├── uiLanguageState.js           # 缓存 settings.uiLanguage，供主进程对话框（已知主机等）取语言
│       └── encodeTerminalWrite.js       # 终端上行按键编码（iconv-lite）
│
├── src/                                 # 渲染进程（React 18 + Vite）
│   ├── main.jsx                         # React 入口、ErrorBoundary、挂载 App
│   ├── App.jsx                          # 主布局：标题栏、侧边栏、标签、终端、各类对话框
│   ├── components/
│   │   ├── TitleBar.jsx                 # 自定义窗口控制（最小化/最大化/关闭）
│   │   ├── Sidebar.jsx                  # 已保存会话树、分组、搜索、导入；内嵌 SftpPanel
│   │   ├── TabBar.jsx                   # 会话标签、拖拽排序、右键菜单
│   │   ├── TerminalPanel.jsx            # xterm 实例、编码、日志、高亮、退格键
│   │   ├── SftpPanel.jsx                # 远程文件树、上传/下载、拖放、传输进度
│   │   ├── ConnectDialog.jsx            # SSH / Telnet / Serial 表单、凭据子弹窗
│   │   ├── SettingsDialog.jsx           # 分标签设置、算法、导入导出、主题预览
│   │   └── common.jsx                   # 公共 UI（如连接类型图标）
│   ├── store/                           # 客户端持久化与 IPC 桥接
│   │   ├── sessionStore.js              # localStorage 会话、分组；导出走 downloadJsonExport
│   │   ├── settingsStore.js             # localStorage 设置、SETTINGS_SCHEMA、导入导出
│   │   └── credentialsBridge.js         # 凭据库同步：解析/合并已保存会话的密钥
│   ├── lib/                             # 纯逻辑（无 React）；按领域 + 导入导出划分
│   │   ├── import/                      # 跨领域导入/导出（会话与设置共用）
│   │   │   ├── constants.js             # 文件大小/条数上限、envelope 版本、导出文件名
│   │   │   ├── parseImportFile.js       # readImportJson、解包/构造导出 envelope（v1）
│   │   │   ├── handleImportErrors.js    # 导入错误码 → 国际化文案
│   │   │   ├── parseSessionsImport.js   # 校验并规范化 JSON 中的会话列表
│   │   │   ├── parseSettingsImport.js   # 设置导入流水线入口
│   │   │   ├── mergeImportedSessions.js # 合并导入会话；按 savedId / 名称+分组 去重
│   │   │   ├── downloadJsonExport.js    # 触发浏览器下载导出文件
│   │   │   ├── pushImportWarning.js     # 追加导入警告（会话/设置共用）
│   │   │   ├── applySessionsImport.js   # 解析 → 合并 → 吸入 vault；UI 结果提示
│   │   │   └── reportSettingsImport.js  # 设置导入成功/失败提示
│   │   ├── session/                     # 会话领域
│   │   │   ├── defaults.js              # 协议默认值、校验常量、表单默认值
│   │   │   ├── utils.js                 # 标签/分组/端口/退格等工具、提取存储字段
│   │   │   ├── normalizeSession.js      # 规范化单条导入会话
│   │   │   └── importWarnings.js        # 格式化会话导入警告供界面显示
│   │   ├── settings/                    # 设置领域
│   │   │   ├── defaults.js              # DEFAULT_SETTINGS、回滚上下限、默认高亮规则
│   │   │   ├── normalize.js             # 钳制回滚/侧栏宽度、日志模式迁移
│   │   │   ├── highlightRules.js        # 高亮规则 ID 与保存时规范化
│   │   │   ├── sanitizeImport.js        # 剥离未知键、安全合并导入设置
│   │   │   └── importWarnings.js        # 格式化设置导入警告供界面显示
│   │   └── sftp/                        # SFTP 界面辅助（仅渲染进程）
│   │       └── formatSftpPathError.js   # 将 shared 中的 SFTP 路径错误码映射为 i18n 提示
│   ├── context/
│   │   └── I18nContext.jsx              # React 上下文 + useI18n()；语言解析走 shared
│   ├── i18n/
│   │   └── translations.js              # 中/英文字符串表（含 SFTP 路径错误文案）
│   ├── theme/
│   │   └── appTheme.js                  # 解析 dark / light / auto 实际主题
│   └── styles/                          # 按界面拆分的样式
│       ├── global.css                   # 基础重置与排版
│       ├── app.css                      # 主布局
│       ├── titlebar.css
│       ├── sidebar.css
│       ├── tabbar.css
│       ├── terminal.css
│       ├── sftp.css
│       ├── dialog.css
│       └── settings.css
│
├── shared/                              # 主进程、Worker 与渲染进程共用（模块内不直接依赖 Electron）
│   ├── terminalEncodings.js             # 编码列表、xterm 二进制串解码辅助
│   ├── sshAlgorithmDefaults.js          # 默认 KEX/加密/MAC 池与弱算法标记
│   ├── resolveUiLanguage.js             # detectLangFromLocaleTags、auto → zh / en
│   └── sftpErrorCodes.js                # SFTP/日志路径错误码、SFTP_PATH_KIND、IPC 错误载荷
│
├── docs/
│   └── images/                          # README 截图（主界面、设置、连接）
│
├── build/                               # electron-builder 应用图标
│
├── index.html                           # Vite HTML 入口（CSP 由 vite 插件注入）
├── vite.config.js                       # React (oxc) 插件、开发服务器、内联 Electron CSP 插件
├── tsconfig.json                        # TypeScript / IDE（src、electron、shared、tests）
├── package.json                         # 脚本、依赖、electron-builder 配置
├── package-lock.json
├── README.md                            # 英文文档
├── README.zh-CN.md                      # 简体中文文档
└── LICENSE                              # MIT 许可证
```

**运行时数据流（简图）：**

```
渲染进程（React / xterm）
    │  window.zterm.* （preload.cjs）
    ▼
主进程（main.js + handlers）
    │  Worker 线程（SSH / SFTP）
    ▼
远程主机 / 本地串口 / 系统钥匙串（safeStorage）

shared/*  ── 主进程、Worker、渲染进程共用（编码、算法、界面语言、SFTP 错误码）
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
# GitHub
git clone https://github.com/zhuhezhang/zterm.git
cd zterm

# 或 Gitee
# git clone https://gitee.com/zhuhezhang/zterm.git
# cd zterm

npm install
npm run dev
```

将启动 Vite 开发服务（端口 **5173**），并以 nodemon 监听 `electron/` 目录后启动 Electron。

其他开发脚本：


| 脚本                     | 说明                              |
| ---------------------- | ------------------------------- |
| `npm run dev:silent`   | 同 `dev`，但屏蔽 Electron 安全警告       |
| `npm run dev:renderer` | 仅启动 Vite                        |
| `npm run dev:electron` | 仅启动 Electron（需 Vite 已在 5173 运行） |


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
- 单次会话导入上限 **5000** 条（见 `src/lib/import/constants.js`）。

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
| SSH 已知主机    | `{userData}/zterm-known-hosts.json`             |
| 加密凭据        | 系统钥匙串（Electron `safeStorage`，可用时）               |
| 会话日志        | 用户配置目录或 `下载/zterm-session-log/`                 |


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
| Windows 便携版 `ZTerm x.x.x.exe` 在资源管理器中图标异常，但右键 **属性** 里图标正常；`release\win-unpacked\ZTerm.exe` 与 `ZTerm Setup x.x.x.exe` 显示正常 | 图标已写入 exe，多为 Windows Shell **图标缓存**（反复用同名覆盖打包时常见）。将文件复制并改名为 `ZTerm-test.exe` 可快速验证；若改名后正常，结束并重启 `explorer.exe`，删除 `%LocalAppData%\Microsoft\Windows\Explorer\` 下的 `iconcache`*、`thumbcache*` 后再打开资源管理器 |


---

## 许可证

[MIT 许可证](LICENSE) — Copyright © 2026 [zhuhezhang](https://github.com/zhuhezhang)

---

**English documentation:** [README.md](README.md)