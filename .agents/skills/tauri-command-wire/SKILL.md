---
name: tauri-command-wire
description: >-
  接通 Admin CS Tauri 命令全链路：Rust command → lib.rs handler → src/api invoke → 页面。
  Use when 新 Tauri 命令、album/icloud invoke、src-tauri 与前端联调。
  cargo 警告门禁见 rust-tauri.mdc。
---

# tauri-command-wire

> **约束权威**：`rust-tauri.mdc`（改完 `cargo check` 0 warning）、`file-naming.mdc`（Rust snake_case）。  
> 样板：`src-tauri/src/album/` + `apps/admin/src/api/album.ts` + `views/album/`

## 步骤

1. 确认画像 `admin-cs`；命令名前后端字符串一致。  
2. 实现 `#[tauri::command]`；用户可触发错误用 `Result` 传播。  
3. `mod` 导出 → `lib.rs` `generate_handler![...]` 注册。  
4. `src/api/<feature>.ts`：`invoke("cmd_name", { ... })` + 类型。  
5. UI 调用 api；复杂流先对齐 `*Flow.md`；免登壳路由见 `admin-route-permission`。  
6. 实跑 `cargo check`，按 `rust-tauri.mdc` 修到 0 warning。

## 完成检查

- [ ] handler 已注册  
- [ ] invoke 名与参数匹配  
- [ ] `cargo check` 0 warning  
- [ ] 主路径如何手测已说明  
