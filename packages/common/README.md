# @llcz/common

共享工具包，发布至 [npm](https://www.npmjs.com/package/@llcz/common)。

- **本地 monorepo**：根目录 `.npmrc` 开启 `link-workspace-packages=true`，消费方声明 `^x.y.z` 且版本能匹配时，链到本包 `packages/common`。
- **服务器（无 workspace）**：按 `package.json` 中的 `^x.y.z` 从 npm 安装。

## 发布

1. 改代码后，在本包 `package.json` 按 semver 抬高 `version`（如 `1.0.4` → `1.0.5`）。
2. 在仓库根目录执行：

```bash
npm publish --access public
```

**publish 成功后会自动执行 `postpublish`**：把 `apps/*` 里声明了 `@llcz/common` 的依赖改为 `^<刚发布的版本>`，并在仓库根执行 `pnpm install` 刷新 lock。无需手改消费方 `package.json`。

3. 确认 npm 已出现新版本：

```bash
npm view @llcz/common version
```

当前会自动同步的消费方：`apps/server`、`apps/admin`（扫描 `apps/*/package.json` 中是否依赖 `@llcz/common`）。

## `postpublish` 与 `sync-consumers`

两个 script 执行的是**同一段脚本**（`scripts/sync-consumers.mjs`），只是触发场景不同：

| 脚本 | 作用 |
|------|------|
| `postpublish` | npm 生命周期钩子：`pack`（`npm publish`）成功后**自动**跑 |
| `sync-consumers` | 手动入口：不 publish 时也能单独同步，或加 `--dry-run` 预览 |

- 发版：改 version → `pnpm --filter @llcz/common pack` → 自动走 `postpublish`
- 只同步：`pnpm --filter @llcz/common sync-consumers`

若只留 `postpublish`，就没法方便地手动同步或 dry-run；若只留 `sync-consumers`，publish 后又要自己再跑一遍。
