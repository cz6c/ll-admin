# c-verify 命令白名单

只跑下表；表外命令须用户点名。包名以各 app `package.json` 为准。

## 允许

| 画像 | 命令 | 期望 |
|------|------|------|
| admin-bs | `pnpm --filter @apps/admin lint` | 无新增 eslint 错误 |
| admin-bs | `pnpm --filter @apps/admin typecheck` | `vue-tsc --noEmit` 通过 |
| server | `pnpm --filter @apps/server lint` | 无新增错误（脚本含 `--fix` 时仍只提交本次范围） |
| server | `pnpm --filter @apps/server typecheck` | `tsc --noEmit` 通过 |
| uni | `pnpm --filter @apps/uni lint` | 无新增错误 |
| uni | `pnpm --filter @apps/uni type-check` | `vue-tsc --noEmit`；wot-ui 既有类型问题单独注明，不擅自全仓救火 |
| admin-cs | `cd apps/admin/src-tauri && cargo check` | **0** `warning:`（`rust-tauri.mdc`） |
| admin-cs | 可选 `cargo test --lib`（改动集中某模块时加模块路径） | 与本次 command 相关的测通过 |

根目录快捷（仅当用户明确要求全仓，或本次确实改了多个包且接受 uni 风险）：

- `pnpm lint` / `pnpm typecheck` / `pnpm check`

## 禁止当作默认验收

- `npm test` / `npm run test`（本仓包管理是 pnpm；且无「改页面必须先写测」门禁）  
- 未改 uni 却为一次 admin 修复去「修」uni 既有 type-check  
- 为跑通而 `#[allow]` 无注释、或放宽 eslint  
- 把 `migration:generate` 当验证步骤（须用户同意才落盘 → `nestjs-server.mdc`）

## 探测脚本名

跑之前确认：

```text
apps/admin  → lint, typecheck
apps/server → lint, typecheck
apps/uni    → lint, type-check
```
