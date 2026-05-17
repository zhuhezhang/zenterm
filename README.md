# ZTerm

**[简体中文](README.zh-CN.md)** · English

ZTerm is a cross-platform desktop terminal emulator built with **Electron**, **React**, and **xterm.js**. It supports **SSH**, **SFTP**, **Telnet**, and **Serial** connections, with saved sessions, grouping, encrypted credential storage, and a polished custom UI (frameless window, dark/light themes, bilingual interface).

---

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Usage Guide](#usage-guide)
- [Settings Reference](#settings-reference)
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
- **Search** saved sessions by name, host, or serial path
- **Duplicate**, **rename**, **edit**, **delete** sessions; optional confirm dialogs
- **Export / import** session lists (JSON)
- **Credential prompt** on connect when secrets are not stored; optional **“Save & connect”** to update vault

### Terminal experience

- **xterm.js** with Fit addon, web links, configurable scrollback (0–500,000 lines)
- **Character encodings**: UTF-8, GBK, GB18030, GB2312, Big5, UTF-16 LE, Latin-1 (via `iconv-lite` in the main process)
- **Backspace mode**: Auto (DEL for SSH, BS for Telnet/Serial), or force DEL / BS per session
- **Terminal interaction**: select-to-copy and right-click paste (toggle in settings)
- **Output highlighting**: regex rules with colors (defaults for error/success/warning/IP)
- **Tab bar**: new connection, close tab/others/left/right/all, clear screen, save terminal output to file
- **Session logging**: off, buffer (matches screen), or stream (raw downstream, ANSI stripped)

### UI & i18n

- Custom **frameless title bar** (minimize / maximize / close)
- **Dark**, **light**, or **auto** theme (follows OS)
- **UI language**: English, 简体中文, or auto (follows system)
- Resizable **sidebar** for saved sessions and SFTP tree

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
├── electron/                 # Main process
│   ├── main.js               # Window, IPC, log writes, path policy
│   ├── preload.cjs           # contextBridge API (window.zterm)
│   ├── handlers/             # ssh, sftp, telnet, serial, credentials
│   ├── workers/              # sshSessionWorker, sftpSessionWorker
│   └── lib/                  # known hosts, path policy, trusted sender
├── src/                      # Renderer (React)
│   ├── App.jsx
│   ├── components/           # Terminal, Sidebar, SFTP, dialogs, …
│   ├── store/                # sessions, settings, credentials bridge
│   ├── i18n/                 # zh / en translations
│   └── styles/
├── shared/                   # terminalEncodings, sshAlgorithmDefaults
├── index.html
├── vite.config.js
└── package.json
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
git clone https://github.com/zhuhezhang/zterm(or git clone https://gitee.com/zhuhezhang/zterm)
cd zterm
npm install
npm run dev
```

This starts the Vite dev server on port **5173** and launches Electron with hot reload for the `electron/` folder.

---

## Usage Guide

### New connection

1. Click **New connection** in the sidebar or tab bar.
2. Choose **SSH**, **Telnet**, or **Serial**.
3. Fill host/port (or serial port from the refreshed list), label, group, encoding, and auth.
4. For SSH, optionally enable **SFTP** to show remote files for that session.
5. Use **Connect** (one-shot) or **Save & connect** (persists session; may store secrets if vault is enabled).

### Saved sessions

- Organize with **groups** (e.g. `Production/Web`). Invalid characters: `\ / : * ? " < > |`
- Right-click sessions for connect, edit, duplicate, delete.
- Use the search box to filter by name, host, or serial path.

### SFTP

- Enabled per SSH session at connect time.
- Upload via button or drag-and-drop; download files or folders.
- Local paths must lie under allowed user directories (see [Security Model](#security-model)).

### Terminal tabs

- Multiple tabs; each tab is an independent session.
- Context menu: close variants, clear screen, save output.
- SSH sessions resize the remote PTY when the terminal is resized.

### Credentials

- If **Save secrets to encrypted storage** is on (Settings → Security), passwords and private keys can be stored in the OS-backed vault.
- Plain session JSON in `localStorage` does **not** contain secrets when vault is used.
- **Clear all vault entries** is available in Settings when vault is available.

---

## Settings Reference

| Setting | Description |
|---------|-------------|
| **App theme** | `dark` / `light` / `auto` |
| **UI language** | `en` / `zh` / `auto` |
| **Terminal scrollback** | Lines kept above viewport (default 20,000) |
| **Terminal interact** | Select to copy, right-click to paste |
| **Logging mode** | `none` / `buffer` / `stream` |
| **Log directory** | Default: `Downloads/zterm-session-log` |
| **Highlight rules** | Regex, case sensitivity, color per rule |
| **SSH algorithms** | KEX, host key, cipher, HMAC preference lists |
| **Save secrets to vault** | Use `safeStorage` for sensitive fields |
| **Confirm delete** | Session / group deletion prompts |
| **Sidebar width** | Persisted layout width |

Import/export **settings** and **sessions** as JSON from the Settings dialog.

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
| Saved sessions (no secrets) | Browser `localStorage` (`zterm_sessions`) |
| App settings | `localStorage` (`zterm_settings`) |
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
| SSH algorithm mismatch | Open Settings → SSH algorithms; enable legacy KEX/cipher required by the server |
| Garbled Chinese output | Set session encoding to **GBK** or **GB18030** |
| SFTP “path not allowed” | Choose a directory under Downloads/Documents/home, not system paths |
| Serial port not listed | Click **Refresh**; on Linux ensure user is in `dialout` group |
| Host key prompt every time | Check write permissions for `userData`; do not run from read-only profiles |

---

## License

MIT License — Copyright © zhuhezhang

---

**中文文档：** [README.zh-CN.md](README.zh-CN.md)
