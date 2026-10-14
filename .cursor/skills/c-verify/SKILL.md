---
name: c-verify
description: >-
  按画像跑本仓允许的验收命令并记录证据：admin lint/typecheck、server tsc、
  uni 单独 lint/type-check、Tauri cargo check。Use when 改完要验证、交付复核、
  跑检查、typecheck、cargo check。禁止臆造 npm test；禁止无必要全仓 pnpm check。
  Not for 实现或改代码。
---

# c-verify

> **约束权威**：`monorepo-core.mdc`（脚本）、`rust-tauri.mdc`、`vue-uni.mdc` 检查注意。  
> 命令白名单：[reference.md](reference.md) · 画像：[../c-entry/profiles.md](../c-entry/profiles.md)

**本 skill 只验证、不修代码。** 失败则把命令与首段错误交回实现回合；不要为消红而改无关文件。

## Trigger

改完业务代码、用户问「验证一下」、`c-workflow` 交付复核。  
**不用**：纯问答；未改对应 app 却跑全仓；把验证当 TDD 红绿循环（本仓不默认 TDD）。

## 探测

1. 看本次 diff 触及的 app（`apps/admin` / `server` / `uni` / `src-tauri`）。  
2. 只跑命中行的白名单命令（[reference.md](reference.md)）。  
3. 先读该包 `package.json` `scripts`，确认脚本名（uni 是 `type-check` 不是 `typecheck`）。

## 步骤

1. 列「改了哪些端」。多端则分端跑，结果分行写。  
2. 按白名单执行；记录 **命令原文 + 退出码 + 与本次 diff 相关的失败**。  
3. Admin UI 再扫一眼 `antd-design-system.mdc` 自检（`$feedback`、间距 8n）；不在此复述模度表。  
4. 未跑项写「未验证」及原因（环境无 Rust、用户未装依赖等）。

## 分叉表

| 画像 | 跑什么 |
|------|--------|
| admin-bs（vue/ts/scss，非 tauri） | `@apps/admin` lint + typecheck |
| admin-cs（改了 `src-tauri`） | 上一项 + `cargo check` 0 warning |
| server | `@apps/server` lint + typecheck；**不**生成 migration |
| uni | **仅** `@apps/uni` lint / type-check |
| 多端 | 分端执行，禁止图省事一条 `pnpm check` 掩盖 uni 既有失败 |

## 完成检查 / 证据

```text
【验证】
- 命令：
- 结果：通过 / 失败（摘相关错误）
- 未跑：
- UI/权限/migration 自检（若适用）：
```

## 反模式 + 交接

- 写「应该没问题」却没跑命令。  
- 默认 `pnpm check` 或 `npm test`。  
- 用 `--no-verify` / 改 lint 规则消红。  
- 失败后的修复 → 回到装配 skill / `c-workflow`；范围对账 → `c-review`。
