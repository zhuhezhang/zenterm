# GitHub Actions 工作流说明

本目录存放项目的 CI/CD 配置。当前仅包含 [`ci.yml`](./ci.yml)，在每次推送或 PR 时自动执行代码质量检查。

## `ci.yml` — 持续集成（CI）

### 触发条件

| 事件 | 分支 / 范围 |
|------|----------------|
| `push` | `main`、`master` |
| `pull_request` | 所有分支（向任意目标分支发起的 PR） |

向 `main` / `master` 推送代码，或针对这些分支（及其他分支）打开/更新 Pull Request 时，工作流会自动运行。

### 作业：`quality`

在 **Ubuntu 最新版**（`ubuntu-latest`）虚拟机上执行，不构建安装包，只做静态分析与单元测试。

### 执行步骤

1. **`actions/checkout@v4`** — 拉取当前 commit 的仓库代码。
2. **`actions/setup-node@v4`** — 安装 **Node.js 22**，并启用 **npm 依赖缓存**（`cache: npm`），加快后续 `npm ci`。
3. **`npm ci`** — 按 `package-lock.json` 精确安装依赖（适合 CI，比 `npm install` 更可复现）。
4. **`npm run typecheck`** — TypeScript 类型检查，覆盖：
   - 渲染进程（`src/`）
   - Electron 主进程（`tsconfig.main.json`）
   - Preload（`tsconfig.preload.json`）
   - 构建脚本等 Node 侧代码（`tsconfig.node.json`）
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

- `npm run build` / 各平台打包（`electron-builder`）
- E2E 或 Electron 窗口级集成测试
- 覆盖率上报（本地可用 `npm run test:coverage`）

如需在 CI 中增加构建或发布流程，可在此目录新增 workflow 文件（例如 `release.yml`）。
