# ZTerm

**[简体中文](README.zh-CN.md)** · English · v1.2.3

ZTerm is a cross-platform desktop terminal emulator built with **Electron**, **React**, and **xterm.js**. It supports **SSH**, **SFTP**, **Telnet**, and **Serial** connections, with saved sessions, hierarchical grouping, encrypted credential storage, and a polished custom UI (frameless window, dark/light themes, bilingual interface).

---

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Import / Export Format](#import--export-format)
- [Security Model](#security-model)
- [Data & Storage Locations](#data--storage-locations)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

### Connection types

| Protocol | Description |
|----------|-------------|
| **SSH** | Interactive shell over SSH (`ssh2`), PTY resize, password or private-key auth, configurable KEX/cipher/MAC algorithms |
| **SFTP** | File browser in the sidebar: list, upload, download, mkdir, rename, delete; progress events; local paths restricted to safe user directories |
| **Telnet** | Raw TCP Telnet client |
| **Serial** | Local serial ports via `serialport` (baud rate, data/stop bits, parity); port list must be chosen from enumerated devices |

### Session management

- Save sessions with **label**, **group** (hierarchical paths), and connection parameters
- **Empty group placeholders** — create folder-like groups before adding sessions
- **Search** saved sessions by name, host, or serial path
- **Duplicate**, **rename**, **edit**, **delete** sessions; optional confirm dialogs
- **Export / import** session lists (JSON envelope, v1); import from **Settings** or the **sidebar**
- **Connect**, **Save & connect**, or **Save only** from the connection dialog
- **Credential prompt** on connect when secrets are not stored; optional **“Save & connect”** to update vault

### Terminal experience

- **xterm.js** with Fit addon, web links, configurable scrollback (0–500,000 lines)
- **Character encodings**: UTF-8, GBK, GB18030, GB2312, Big5, UTF-16 LE, Latin-1 (via `iconv-lite` in the main process)
- **Backspace mode** (per session): Auto (DEL for SSH, BS for Telnet/Serial), or force DEL / BS
- **Terminal interaction**: select-to-copy and right-click paste (toggle in settings)
- **Output highlighting**: regex rules with colors (defaults for error/success/warning/IP)
- **Tab bar**: new connection, close tab/others/left/right/all, clear screen, save terminal output to file
- **Session logging**: off, buffer (matches screen), or stream (raw downstream, ANSI stripped); log path validated against allowed directories

### UI & i18n

- Custom **frameless title bar** (minimize / maximize / close)
- **Dark**, **light**, or **auto** theme (follows OS); **live preview** in Settings before saving
- **UI language**: English, 简体中文, or auto (follows system)
- Resizable **sidebar** for saved sessions and SFTP tree
- **Settings dialog** organized into General, SSH & Terminal, and Data & Security tabs

### Security-related behavior

- Renderer runs with **context isolation**, **sandbox**, no Node integration
- IPC limited to **trusted** main-window senders
- **SSH host key verification** (known-hosts style, `userData/zterm-known-hosts.json`); prompts on first connect and fingerprint change
- **Weak SSH algorithms** flagged in settings; modern defaults exclude legacy CBC / SHA-1 / `ssh-rsa` where possible
- Optional **encrypted vault** for passwords and keys (`safeStorage` when available)
- **Local path policy** for logs and SFTP: only under home, Documents, Downloads, Desktop, userData, etc.

---

## Screenshots

![ZTerm main](docs/images/main.png)
![ZTerm setting](docs/images/setting.png)
![ZTerm connection](docs/images/connection.png)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop shell | Electron 42 |
| UI | React 18, Vite 8 |
| Terminal | @xterm/xterm 5, Fit addon, Web Links addon |
| SSH / SFTP | ssh2 |
| Serial | serialport 12 |
| Encoding | iconv-lite |
| Packaging | electron-builder |

---

## Project Structure

```
zterm/
├── electron/                          # Main process (Node.js + Electron APIs)
│   ├── main.js                        # App entry: frameless window, IPC routing, session log I/O
│   ├── preload.cjs                    # contextBridge → window.zterm (SSH/SFTP/Telnet/Serial/credentials/window/log)
│   ├── handlers/                      # IPC handlers registered from main.js
│   │   ├── ssh.js                     # SSH connect/disconnect, PTY I/O, resize; delegates to worker
│   │   ├── sftp.js                    # SFTP list/upload/download/mkdir/rename/delete; delegates to worker
│   │   ├── telnet.js                  # Telnet TCP socket connect and byte stream I/O
│   │   ├── serial.js                  # Serial port enumerate/open/write; path whitelist vs listPorts
│   │   └── credentials.js             # safeStorage vault: get/sync/remove/duplicate/clearAll
│   ├── workers/                       # Worker threads (isolate blocking ssh2 I/O from main loop)
│   │   ├── sshSessionWorker.js        # Per-session SSH shell in a worker
│   │   └── sftpSessionWorker.js       # Per-session SFTP client in a worker
│   └── lib/                           # Shared main-process utilities
│       ├── trustedSender.js           # Allow IPC only from the registered main BrowserWindow
│       ├── localPathPolicy.js         # Validate log/SFTP local paths against allowed roots
│       ├── sftpLocalPathRoots.js      # Resolve OS user folders (home, Downloads, Documents, …)
│       ├── sshKnownHosts.js           # Persist and verify SSH host keys (zterm-known-hosts.json)
│       └── encodeTerminalWrite.js     # Encode outgoing terminal keystrokes (iconv-lite)
│
├── src/                               # Renderer (React 18 + Vite)
│   ├── main.jsx                       # React root, ErrorBoundary, mounts App
│   ├── App.jsx                        # Shell layout: title bar, sidebar, tabs, terminal, dialogs
│   ├── components/
│   │   ├── TitleBar.jsx               # Custom window controls (min/max/close)
│   │   ├── Sidebar.jsx                # Saved sessions tree, groups, SFTP host, import sessions
│   │   ├── TabBar.jsx                 # Session tabs, reorder, context menu actions
│   │   ├── TerminalPanel.jsx          # xterm.js instance, encoding, logging, highlights, backspace
│   │   ├── SftpPanel.jsx              # Remote file tree and transfer UI
│   │   ├── ConnectDialog.jsx          # SSH / Telnet / Serial form, credentials sub-dialog
│   │   ├── SettingsDialog.jsx         # Tabbed settings, algorithms, import/export, theme preview
│   │   └── common.jsx                 # Shared UI bits (e.g. connection type icons)
│   ├── store/                         # Client-side persistence and IPC bridges
│   │   ├── sessionStore.js            # localStorage sessions, groups, export/import envelope
│   │   ├── settingsStore.js           # localStorage settings, schema, export/import
│   │   └── credentialsBridge.js       # Vault sync: resolve/merge secrets for saved sessions
│   ├── lib/
│   │   ├── import/
│   │   │   ├── parseImportFile.js     # readImportJson, unwrap/build export envelope (v1)
│   │   │   ├── parseSessionsImport.js # Session import pipeline entry
│   │   │   ├── parseSettingsImport.js # Settings import pipeline entry
│   │   │   ├── validateSessions.js    # Per-item session validation rules
│   │   │   ├── validateSettings.js    # Settings shape validation
│   │   │   └── handleImportErrors.js  # Localized import error codes
│   │   ├── session/
│   │   │   ├── constants.js           # Protocol defaults, storage fields, import size limit
│   │   │   ├── utils.js               # Label/group/port/backspace helpers, pick storage fields
│   │   │   ├── normalizeSession.js    # Normalize imported session objects
│   │   │   └── normalizeImport.js     # Legacy import compatibility
│   │   └── settings/
│   │       ├── defaults.js            # DEFAULT_SETTINGS, scrollback bounds, default highlight rules
│   │       ├── normalize.js           # Clamp scrollback, sidebar width, logging mode migration
│   │       └── sanitizeImport.js      # Strip unknown keys on settings import
│   ├── context/
│   │   └── I18nContext.jsx            # React context + useI18n() for UI strings
│   ├── i18n/
│   │   ├── translations.js            # zh / en string tables
│   │   └── resolveUiLanguage.js       # Resolve auto → effective language
│   ├── theme/
│   │   └── appTheme.js                # Resolve dark / light / auto effective theme
│   └── styles/                        # CSS split by surface
│       ├── global.css                 # Base reset and typography
│       ├── app.css                    # Main layout
│       ├── titlebar.css
│       ├── sidebar.css
│       ├── tabbar.css
│       ├── terminal.css
│       ├── sftp.css
│       ├── dialog.css
│       └── settings.css
│
├── shared/                            # Imported by both main and renderer (no Electron in module graph)
│   ├── terminalEncodings.js           # Encoding list, decode helpers for xterm binary strings
│   └── sshAlgorithmDefaults.js        # Default KEX/cipher/MAC pools and weak-algorithm flags
│
├── docs/
│   └── images/                        # README screenshots (main, settings, connection)
|
├── build/                             # icon
│
├── index.html                         # Vite HTML entry (CSP injected by vite plugin)
├── vite.config.js                     # React (oxc) plugin, dev server, Electron CSP plugin
├── jsconfig.json                      # Path aliases / JS tooling hints
├── package.json                       # Scripts, dependencies, electron-builder config
├── package-lock.json
├── README.md                          # English documentation
├── README.zh-CN.md                    # 简体中文文档
└── LICENSE                            # MIT License
```

**Runtime data flow (simplified):**

```
Renderer (React/xterm)
    │  window.zterm.*  (preload.cjs)
    ▼
Main process (main.js + handlers)
    │  worker threads (SSH/SFTP)
    ▼
Remote host / local serial port / OS keychain (safeStorage)
```

---

## Requirements

- **Node.js** 18+ (LTS recommended)
- **npm** 9+
- **Platform build tools** (for native modules):
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Visual Studio Build Tools, Python (for `node-gyp`)
  - **Linux**: `build-essential`, `libudev-dev` (for Serial)

---

## Quick Start

```bash
# GitHub
git clone https://github.com/zhuhezhang/zterm.git
cd zterm

# or Gitee
# git clone https://gitee.com/zhuhezhang/zterm.git
# cd zterm

npm install
npm run dev
```

This starts the Vite dev server on port **5173** and launches Electron with hot reload for the `electron/` folder.

Other dev scripts:

| Script | Description |
|--------|-------------|
| `npm run dev:silent` | Same as `dev`, but suppresses Electron security warnings |
| `npm run dev:renderer` | Vite only |
| `npm run dev:electron` | Electron only (expects Vite on 5173) |

---

## Import / Export Format

Exported **sessions** and **settings** use a versioned JSON envelope (max file size **8 MB**):

```json
{
  "ztermExport": "sessions",
  "version": 1,
  "exportedAt": "Mon May 19 2026 ...",
  "data": [ /* session objects or settings object */ ]
}
```

- `ztermExport` must be `"sessions"` or `"settings"` (cross-import is rejected).
- `version` must be `1`.
- Unknown settings keys are stripped on import; invalid sessions are skipped with a summary alert.

---

## Security Model

1. **Process separation**: Network and filesystem access run in the main process and worker threads; the renderer only calls whitelisted IPC via `preload.cjs`.
2. **Trusted IPC**: Window control, logging, and credential APIs reject senders that are not the registered main window.
3. **SSH MITM mitigation**: Host keys are recorded; unknown or changed fingerprints require user confirmation in a native dialog.
4. **Algorithm hygiene**: Defaults prefer modern AEAD ciphers and EtM MACs; legacy options remain selectable for old equipment but are marked weak in the UI.
5. **Path sandboxing**: Session logs and SFTP local read/write paths must resolve under standard user folders or app `userData`.
6. **Serial safety**: Connect only accepts paths returned by `listPorts` (refreshed list), reducing arbitrary device open attempts.

This app is a convenience tool, not a full security audit. Review your threat model before storing production keys in the vault.

---

## Data & Storage Locations

| Data | Location |
|------|----------|
| Saved sessions (no secrets) | `localStorage` → `zterm_saved_sessions` |
| Empty group placeholders | `localStorage` → `__zterm_group_placeholders__` |
| App settings | `localStorage` → `zterm_settings` |
| SSH known hosts | `{userData}/zterm-known-hosts.json` |
| Encrypted credentials | OS keychain via Electron `safeStorage` (when available) |
| Session logs | User-configured or `Downloads/zterm-session-log/` |

Typical `userData` paths:

- **macOS**: `~/Library/Application Support/zterm/`
- **Windows**: `%APPDATA%\zterm\`
- **Linux**: `~/.config/zterm/`

---

## Troubleshooting

| Issue | Suggestions |
|-------|-------------|
| `npm install` fails on `serialport` | Install platform build tools; on Linux install `libudev-dev` |
| SSH algorithm mismatch | Open Settings → SSH & Terminal → algorithms; enable legacy KEX/cipher required by the server |
| Garbled Chinese output | Set session encoding to **GBK** or **GB18030** |
| SFTP “path not allowed” | Choose a directory under Downloads/Documents/home, not system paths |
| Serial port not listed | Click **Refresh**; on Linux ensure user is in `dialout` group |
| Host key prompt every time | Check write permissions for `userData`; do not run from read-only profiles |
| Import fails / wrong file type | Use the correct export file (`sessions` vs `settings`); max 8 MB |
| Windows portable `ZTerm x.x.x.exe` shows the wrong icon in File Explorer, but **Properties** shows the correct icon; `win-unpacked\ZTerm.exe` and `ZTerm Setup x.x.x.exe` look fine | The icon is embedded in the EXE; this is usually the Windows Shell **icon cache** (common when rebuilding the same portable file name). Copy and rename the file (e.g. `ZTerm-test.exe`) to verify. If that fixes it, restart `explorer.exe`, delete `iconcache*` and `thumbcache*` under `%LocalAppData%\Microsoft\Windows\Explorer\`, then open File Explorer again |

---

## License

[MIT License](LICENSE) — Copyright © 2026 [zhuhezhang](https://github.com/zhuhezhang)

---

**中文文档：** [README.zh-CN.md](README.zh-CN.md)
