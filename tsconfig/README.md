# TypeScript 配置说明

本目录集中存放 ZTerm 的全部 `tsconfig*.json`（五个文件）。配置文件内的 `include`、`paths`、`outDir`、`rootDir` 等路径均**相对于本目录**书写，因此指向源码时使用 `../` 回到项目根目录。

项目根目录另有一个 [`../tsconfig.json`](../tsconfig.json)，仅含 `"extends": "./tsconfig/tsconfig.json"`，供 Cursor / VS Code 自动发现渲染进程配置；不参与额外编译规则。

## 文件一览

| 文件 | 用途 | 谁在用 |
|------|------|--------|
| [`tsconfig.base.json`](./tsconfig.base.json) | 公共编译选项（`strict`、`target` 等） | 被其余四个配置 `extends` |
| [`tsconfig.json`](./tsconfig.json) | **渲染进程**：React / Vite / 单元测试 | IDE 类型提示、`npm run typecheck` 第一项 |
| [`tsconfig.main.json`](./tsconfig.main.json) | **Electron 主进程** + `shared/` 编译输出 | `tsc -p` 开发 watch、生产 `build:main` |
| [`tsconfig.preload.json`](./tsconfig.preload.json) | **Preload** 类型检查（实际打包由 esbuild） | `npm run typecheck` |
| [`tsconfig.node.json`](./tsconfig.node.json) | **构建工具链**：Vite / Vitest / ESLint / scripts | `npm run typecheck` |

## 各配置详解

### `tsconfig.base.json`

全项目共享的「底线」：

- `target: ES2022`、`strict: true`
- 不包含 `module` / `jsx` / `paths`——由各子配置按运行环境自行定义

### `tsconfig.json`（渲染进程 + 测试）

覆盖范围：

- `../src` — React 界面与渲染进程逻辑
- `../shared` — 前后端共用类型与工具
- `../tests` — Vitest 单元测试

特点：

- `moduleResolution: bundler`，配合 Vite，**只类型检查、不 emit**（`noEmit: true`）
- `paths` 中 `@/*` → `../src/*`，与 `vite.config.ts` 的 alias 一致
- **排除** `../electron`，避免与主进程配置的模块解析规则冲突

本地命令：

```bash
npx tsc --noEmit -p tsconfig/tsconfig.json
```

### `tsconfig.main.json`（Electron 主进程）

覆盖范围：

- `../electron/**/*.ts`（不含 `preload.ts`）
- `../shared/**/*.ts`

输出：

- `outDir: ../dist-electron`，`rootDir: ..`
- 编译后例如 `electron/main.ts` → `dist-electron/electron/main.js`

本地命令：

```bash
npx tsc -p tsconfig/tsconfig.main.json          # 单次编译
npx tsc -p tsconfig/tsconfig.main.json -w       # watch（dev 模式）
```

### `tsconfig.preload.json`

仅包含 `../electron/preload.ts`，用于 preload 脚本的**类型检查**。

实际 dev / 生产打包由 **esbuild** 完成（`package.json` 的 `build:preload` / `watch:preload`），不走 `tsc` emit。

### `tsconfig.node.json`（工具链）

覆盖范围：

- `../vite.config.ts`、`../vitest.config.ts`、`../eslint.config.ts`
- `../scripts/**/*.ts`

与渲染进程类似，仅 `noEmit` 类型检查，不参与应用打包。

## 与 npm scripts 的对应关系

| 命令 | 使用的配置 |
|------|------------|
| `npm run typecheck` | 依次：`tsconfig.json` → `tsconfig.main.json` → `tsconfig.preload.json` → `tsconfig.node.json` |
| `npm run watch:main` | `tsconfig.main.json`（`-w`） |
| `npm run build:main` | `scripts/build-electron.ts` 内调用 `tsconfig.main.json` |

## 为何拆成多个文件？

Electron 项目里至少存在三种运行环境，TypeScript 规则无法一套通吃：

| 环境 | 模块系统 | DOM | 是否 emit |
|------|----------|-----|-----------|
| 渲染进程（Vite） | ESM + bundler | ✅ | ❌ |
| 主进程（Node / Electron） | NodeNext | ❌ | ✅ → `dist-electron` |
| 配置文件（Node 跑 TS） | bundler / ESM | ❌ | ❌ |

拆开后 IDE 与 CI 各取所需，互不干扰。

## IDE（Cursor / VS Code）提示

根目录 [`tsconfig.json`](../tsconfig.json) 已指向本目录的 `tsconfig.json`，一般无需额外设置。若 `@/` 路径或 React 类型提示仍异常，可在工作区设置中显式指定：

```json
{
  "typescript.tsconfig": "tsconfig/tsconfig.json"
}
```

## 修改配置时注意

1. **改 `paths` 或 `include`**：同步检查 `vite.config.ts`（alias）、`vitest.config.ts`（alias）是否一致。
2. **改 `outDir` / `rootDir`**：主进程 import 路径写 `.js` 后缀（NodeNext ESM 要求），编译输出目录须仍为 `dist-electron`。
3. **新增需类型检查的目录**：放进对应配置的 `include`，不要塞进 `tsconfig.base.json`（base 只做公共选项）。
