# c-verify 命令白名单

只跑下表；表外命令须用户点名。包名以各 app `package.json` 为准。

## 允许

| 画像 | 命令 | 期望 |
|------|------|------|
| admin-bs | 见下方「lint 与 --fix」；可补 `pnpm --filter @apps/admin typecheck` | 无新增 eslint / `vue-tsc --noEmit` 通过 |
| server | 见下方「lint 与 --fix」；可补 `pnpm --filter @apps/server typecheck` | 无新增错误 / `tsc --noEmit` 通过 |
| uni | 见下方「lint 与 --fix」；可补 `pnpm --filter @apps/uni type-check` | 无新增错误；wot-ui 既有类型问题单独注明，不擅自全仓救火 |
| admin-cs | `cd apps/admin/src-tauri && cargo check` | **0** `warning:`（`rust-tauri.mdc`） |
| admin-cs | 可选 `cargo test --lib`（改动集中某模块时加模块路径） | 与本次 command 相关的测通过 |

根目录快捷（仅当用户明确要求全仓，或本次确实改了多个包且接受 uni 风险）：

- `pnpm lint` / `pnpm typecheck` / `pnpm check`

## lint 与 `--fix`（强制）

本仓若干包的 `lint` 脚本带 **`--fix`**（如 `@apps/admin` 的 `lint:eslint`）。验收默认**禁止**用包级 lint 当第一手命令，否则会改写范围外文件并污染暂存/提交。

| 优先级 | 做法 |
|--------|------|
| **1. 推荐** | 对**本次改动路径**跑 eslint：**不加** `--fix`。例：`pnpm exec eslint --max-warnings 0 "src/views/album/components/MediaViewer.vue"`（在对应 app 目录下） |
| **2. 补充** | 需要包级证据时再跑 `pnpm --filter <pkg> lint`；跑完立刻 `git status` / `git diff` |
| **3. 清理** | 若 `--fix` 改了范围外文件：`git restore`（或等价）还原后再报告；**禁止**把无关格式化带进提交 |

server / uni 同理：脚本若含 `--fix`，仍只允许提交本次需求范围；无关 fix 一律还原。

## 禁止当作默认验收

- `npm test` / `npm run test`（本仓包管理是 pnpm；且无「改页面必须先写测」门禁）  
- 未改 uni 却为一次 admin 修复去「修」uni 既有 type-check  
- 为跑通而 `#[allow]` 无注释、或放宽 eslint  
- 把带 `--fix` 的全 app / 全仓 lint 当默认验收（会误改无关文件）  
- 把 `migration:generate` 当验证步骤（须用户同意才落盘 → `nestjs-server.mdc`）

## 探测脚本名

跑之前确认：

```text
apps/admin  → lint, typecheck
apps/server → lint, typecheck
apps/uni    → lint, type-check
```
