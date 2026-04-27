# ZTerm - 终端模拟器

一个基于 **Electron + React + Vite** 的跨平台终端模拟器，支持 **SSH、SFTP、Telnet 和串口** 连接。

## ✨ 功能特性

- 🔐 **SSH 连接** - 支持密码和密钥认证的远程 Shell 访问
- 📁 **SFTP 文件传输** - 远程文件的上传、下载、删除、重命名等操作
- 🔌 **Telnet 连接** - 经典 Telnet 协议支持
- 🖇️ **串口通信** - 直接访问本地串口设备
- 💾 **会话保存** - 保存常用连接配置，快速连接
- 🏷️ **分组管理** - 按分组组织和管理连接
- 🎨 **自定义界面** - 无边框自定义标题栏，现代化 UI
- 📊 **多标签支持** - 同时打开多个连接

## 🛠️ 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Electron | ^28.0.0 | 桌面应用框架 |
| React | ^18.2.0 | 前端框架 |
| Vite | ^5.0.8 | 前端构建工具 |
| ssh2 | ^1.15.0 | SSH 连接库 |
| serialport | ^12.0.0 | 串口通信库 |
| xterm.js | ^5.5.0 | 终端 UI 渲染 |
| electron-builder | ^24.9.1 | 应用打包工具 |

## 📁 项目结构

```
01-zterm/
├── electron/                          # Electron 主进程代码
│   ├── main.js                        # 应用入口，窗口管理、IPC 通信
│   ├── preload.js                     # 安全网桥，暴露 IPC 接口
│   └── handlers/                      # 协议处理器
│       ├── ssh.js                     # SSH 连接处理
│       ├── sftp.js                    # SFTP 文件传输处理
│       ├── telnet.js                  # Telnet 连接处理
│       └── serial.js                  # 串口通信处理
├── src/                               # React 前端代码
│   ├── App.jsx                        # 主应用组件
│   ├── main.jsx                       # 渲染进程入口
│   ├── components/                    # 页面组件
│   │   ├── TitleBar.jsx               # 自定义标题栏
│   │   ├── Sidebar.jsx                # 左侧边栏（会话列表）
│   │   ├── TabBar.jsx                 # 标签栏
│   │   ├── TerminalPanel.jsx          # 主终端显示区域
│   │   ├── ConnectDialog.jsx          # 新建连接对话框
│   │   ├── SettingsDialog.jsx         # 设置对话框
│   │   └── SftpPanel.jsx              # SFTP 文件浏览器
│   ├── store/                         # 数据管理
│   │   ├── sessionStore.js            # 本地会话存储
│   │   └── settingsStore.js           # 应用设置存储
│   └── styles/                        # 样式文件
│       ├── app.css                    # 主应用样式
│       ├── global.css                 # 全局样式
│       ├── dialog.css                 # 对话框样式
│       ├── settings.css               # 设置对话框样式
│       ├── sidebar.css                # 边栏样式
│       ├── tabbar.css                 # 标签栏样式
│       ├── terminal.css               # 终端样式
│       ├── titlebar.css               # 标题栏样式
│       └── sftp.css                   # SFTP 面板样式
├── package.json                       # 项目元数据和依赖
├── vite.config.js                     # Vite 构建配置
├── index.html                         # Electron 窗口 HTML 入口
├── jsconfig.json                      # JavaScript 配置
└── README.md                          # 项目说明（本文件）
```

## 🏗️ 架构设计

### IPC 通信架构

```
┌─────────────────┐
│  React 前端界面   │  (渲染进程)
│ window.zterm.* │ ←─────────┐
└────────┬────────┘          │
         │ ipcRenderer       │ mainWindow.webContents.send
         ↓                   │
┌─────────────────┐          │
│  preload.js     │          │
│  (安全网桥)      │          │
└────────┬────────┘          │
         │ ipcRenderer       │
         ↓                   │
┌─────────────────┐          │
│ Electron 主进程  │  ◄───────┘
│  main.js        │
│  handlers/      │
└────────┬────────┘
         ↓
    ┌────────────────┐
    │ 外部服务        │
    ├─ SSH 客户端    │
    ├─ SFTP 服务    │
    ├─ Telnet 客户端 │
    └─ 串口驱动      │
```

### 数据流向

1. **用户操作** → React 组件
2. **组件调用** → `window.zterm.*` (preload.js 暴露)
3. **IPC 消息** → Electron 主进程
4. **处理响应** → handlers 中的实际业务逻辑
5. **结果返回** → IPC 回调 → React 组件 → UI 更新

## 🚀 快速开始

### 前置要求

- Node.js 14+ 和 npm/yarn
- macOS、Windows 或 Linux

### 安装依赖

```bash
npm install
```

### 开发模式

启动 Vite 开发服务器和 Electron 应用：

```bash
npm run dev
```

该命令会：
1. 启动 Vite 开发服务器（端口 5173）
2. 等待服务器启动后启动 Electron
3. 应用自动加载 `http://localhost:5173`

### 仅启动 Vite 服务器

```bash
npm run vite
```

### 仅启动 Electron

```bash
npm run electron
```

### 生产构建

构建并打包应用：

```bash
npm run build
```

构建成果：
- `dist/` - 前端静态资源
- `dist-electron/` - 打包后的应用（可执行文件）

## 🔧 主要文件说明

### electron/main.js

应用主进程，负责：
- 创建和管理 BrowserWindow（应用窗口）
- 处理窗口控制（最小化、最大化、关闭）
- 管理应用生命周期
- 设置 IPC 通信处理器
- 日志系统集成

**关键代码：**
```javascript
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
// true: 加载 http://localhost:5173 开发服务器
// false: 加载打包后的 dist/index.html
```

### electron/preload.js

安全网桥，在沙箱环境中暴露受限的 Electron API 给渲染进程：

```javascript
window.zterm = {
  // 窗口控制
  window: { minimize, maximize, close, isMaximized, onMaximized },
  
  // SSH 操作
  ssh: { connect, disconnect, sendData, resize, onData, onClose },
  
  // SFTP 操作
  sftp: { connect, disconnect, list, download, upload, mkdir, delete, rename },
  
  // 其他功能
  log: { write },
  getDownloadsPath: () => ...,
}
```

### electron/handlers/*.js

各协议处理器：
- **ssh.js** - SSH 连接管理，Shell 会话，数据收发
- **sftp.js** - SFTP 文件操作，传输进度跟踪
- **telnet.js** - Telnet Socket 连接
- **serial.js** - 串口设备通信

### src/App.jsx

主应用组件，管理：
- 活跃会话列表
- UI 状态（侧边栏宽度、对话框显示等）
- 数据初始化和持久化
- 布局组件编排

### src/store/*.js

状态和数据管理：
- **sessionStore.js** - 保存/加载会话配置到 localStorage
- **settingsStore.js** - 应用设置的存储和读取

### src/components/*.jsx

UI 组件：
- **TitleBar** - 无边框标题栏（自定义窗口控制按钮）
- **Sidebar** - 已保存会话列表，分组显示，快速连接
- **TabBar** - 当前打开的会话标签
- **TerminalPanel** - xterm.js 终端显示和输出
- **ConnectDialog** - 新建连接表单，支持 4 种协议
- **SettingsDialog** - 应用配置和用户偏好
- **SftpPanel** - SFTP 文件浏览器，树形文件展示

## 💡 开发指南

### 添加新的协议支持

1. 在 `electron/handlers/` 创建新的 handler 文件（如 `handlers/myproto.js`）
2. 实现 `setupMyprotoHandlers(ipcMain, mainWindow)` 函数
3. 在 `main.js` 中调用该函数
4. 在 `preload.js` 中暴露 API
5. 在 React 组件中调用 `window.zterm.myproto.*` 方法

### 添加新的 UI 组件

1. 在 `src/components/` 创建 `.jsx` 文件
2. 导入必要的依赖和样式
3. 在 `App.jsx` 中引入并使用
4. 创建对应的 `.css` 样式文件

### 持久化新的数据

1. 将数据保存到 store 文件（如 `sessionStore.js`）
2. 使用 localStorage 或 localStorage 的包装函数
3. 在 App 组件初始化时加载数据

## 🔒 安全特性

- ✅ **上下文隔离** (`contextIsolation: true`) - 隔离主进程和渲染进程
- ✅ **沙箱模式** (`sandbox: false` - 允许 Node 访问，但通过 preload 受限)
- ✅ **无 Node 集成** (`nodeIntegration: false`) - 禁止直接 Node.js 访问
- ✅ **受限 IPC** - 仅暴露必要的 API 给渲染进程

## 📦 打包配置

electron-builder 配置（package.json）：
- **appId**: com.zterm.app
- **productName**: ZTerm
- **输出目录**: dist-electron/
- **包含文件**: dist/ 和 electron/ 文件夹

## 🐛 常见问题

### 开发时出现 "Cannot find module" 错误

确保已运行 `npm install`，且 `node_modules` 目录完整。

### Electron 加载不了页面

检查 Vite 开发服务器是否运行在 `http://localhost:5173`，或查看 Console 的错误信息。

### 打包后应用无法运行

1. 检查 `package.json` 中 `build.files` 配置是否包含所有必要文件
2. 确认 `dist/` 和 `electron/` 目录构建完成
3. 查看应用日志（通常在 `~/.config/ZTerm/logs/`）

## 📝 许可证

MIT License

## 👨‍💻 作者

**zhuhezhang**
- Email: zhuhezhang@qq.com
- GitHub: https://github.com/zhuhezhang
- Gitee: https://gitee.com/zhuhezhang

---

**最后更新**: 2026 年 4 月 6 日
