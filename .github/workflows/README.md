# GitHub Actions 工作流说明

本目录存放项目的 CI/CD 配置：

- [`ci.yml`](./ci.yml) — 推送 / PR 时自动跑类型检查、Lint、单元测试
- [`release.yml`](./release.yml) — **仅手动触发**，在 GitHub 上打包各平台安装包

## `ci.yml` — 持续集成（CI）

### 触发条件

| 事件 | 分支 / 范围 |
|------|----------------|
| `push` | `main`、`master` |
| `pull_request` | 所有分支（向任意目标分支发起的 PR） |

向 `main` / `master` 推送代码，或针对这些分支（及其他分支）打开/更新 Pull Request 时，工作流会自动运行。

### 作业：`quality`

在 **Ubuntu 24.04** 与 **Windows 最新版**（`windows-latest`）矩阵上各跑一遍，不构建安装包，只做静态分析与单元测试（路径策略等用例需在 Windows 上验证）。

### 执行步骤

1. **`actions/checkout@v4`** — 拉取当前 commit 的仓库代码。
2. **`actions/setup-node@v4`** — 安装 **Node.js 22**，并启用 **npm 依赖缓存**（`cache: npm`），加快后续 `npm ci`。
3. **`npm ci`** — 按 `package-lock.json` 精确安装依赖（适合 CI，比 `npm install` 更可复现）。
4. **`npm run typecheck`** — TypeScript 类型检查，覆盖：
   - 渲染进程（`src/`）
   - Electron 主进程（`tsconfig/tsconfig.main.json`）
   - Preload（`tsconfig/tsconfig.preload.json`）
   - 构建脚本等 Node 侧代码（`tsconfig/tsconfig.node.json`）
5. **`npm run lint`** — ESLint，检查 `src`、`electron`、`shared`、`tests`。
6. **`npm run test`** — Vitest 单元测试（`vitest run`，单次运行后退出）。

任一步失败则整个作业失败，PR 上会显示 ❌，需修复后重新推送。

### 本地对齐 CI

合并前可在本地依次执行相同命令：

```bash
npm ci
npm run typecheck
npm run lint
npm run test
```

### 未包含的内容

当前 CI **不**执行：

- 各平台打包（`electron-builder`）— 请使用 [`release.yml`](./release.yml) 手动触发
- E2E 或 Electron 窗口级集成测试
- 覆盖率上报（本地可用 `npm run test:coverage`）

---

## `release.yml` — 手动打包发布

### 触发条件

**仅** `workflow_dispatch`（手动运行），不会在 push / PR 时自动打包。

在 GitHub 仓库页面：**Actions → Release → Run workflow**，选择分支并配置参数。

### 两种模式

| 模式 | 说明 |
|------|------|
| **`artifacts_only`**（默认） | 按需勾选 Windows / Linux / macOS，产物仅上传到 Actions **Artifacts** |
| **`github_release_all`** | **一次性**打包全部平台（Win x64 + Linux x64 + macOS universal），完成后自动发布到 **GitHub Releases** |

#### `artifacts_only` 可选项

| 输入 | 说明 | 默认 |
|------|------|------|
| Build Windows | NSIS 安装包 + 便携版 exe + zip | ✅ |
| Build Linux | AppImage + deb + tar.gz | ✅ |
| Build macOS | dmg + zip | ✅ |
| Windows CPU architecture | `x64` 或 `ia32` | `x64` |
| macOS CPU architecture | `arm64`、`x64` 或 `universal` | `arm64` |

未勾选的平台对应 job 会跳过。

#### `github_release_all` 必填 / 可选项

| 输入 | 说明 |
|------|------|
| **release_tag** | **必填**，如 `v3.2.1`（需与 `package.json` 版本对应；若 tag 不存在会在当前 commit 创建） |
| release_name | 可选，Release 页面标题；留空则用 tag |
| prerelease | 是否标记为预发布 |

此模式下会**忽略**上方的平台勾选与架构选项，固定构建：

- Windows **x64**（Setup + portable + zip）
- Linux **x64**（AppImage + deb + tar.gz）
- macOS **universal**（dmg + zip，同时支持 Apple Silicon 与 Intel）

三平台 job 全部成功后，`publish-release` job 会将所有安装包上传到 GitHub Releases，并自动生成 Release Notes。

### 作业与产物

| Job | Runner | Artifact 名称 | 典型文件（版本号以 `package.json` 为准） |
|-----|--------|---------------|------------------------------------------|
| `build-windows` | `windows-latest` | `zterm-windows-x64` / `zterm-windows-ia32` | `ZTerm Setup x.x.x.exe`、`ZTerm x.x.x.exe`（便携版）、`ZTerm-x.x.x-win.zip` |
| `build-linux` | `ubuntu-latest` | `zterm-linux-x64` | `.AppImage`、`.deb`、`.tar.gz` |
| `build-mac` | `macos-latest` | `zterm-macos-{arch}` | `.dmg`、`-mac.zip` |
| `publish-release` | `ubuntu-latest` | — | 仅 `github_release_all` 模式；创建 GitHub Release 并附加全部安装包 |

`artifacts_only` 模式：在 workflow run 页面底部 **Artifacts** 下载。  
`github_release_all` 模式：在仓库 **Releases** 页面下载；Artifacts 仍会保留一份备份。

### 使用示例（发布正式版）

1. 确认 `package.json` 中 `version` 已更新（如 `3.2.1`）
2. 将代码 push 到 GitHub（建议在 `main` 分支）
3. **Actions → Release → Run workflow**
4. 设置：
   - **mode** = `github_release_all`
   - **release_tag** = `v3.2.1`
   - **release_name** = `ZTerm 3.2.1`（可选）
5. 等待约 20–40 分钟（三平台并行），完成后在 **Releases** 查看

### 注意事项

- macOS 包必须在 `macos-latest` 上构建，无法在 Windows/Linux runner 交叉编译。
- Linux 构建会安装 `libudev-dev`（`serialport` 原生模块需要）。
- `github_release_all` 需要仓库 **Settings → Actions → General → Workflow permissions** 为 **Read and write permissions**（或至少允许 `GITHUB_TOKEN` 写入 contents）。
- 同一 `release_tag` 已存在 Release 时，再次运行会失败；需删除旧 Release/tag 或使用新 tag。
- Actions Artifacts 默认保留 90 天（可在仓库 Settings → Actions 调整）。
- 未配置 Apple / Windows 代码签名时，产物为未签名版本；macOS 首次打开可能需在系统设置中允许。
