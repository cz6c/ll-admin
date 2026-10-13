---
name: tauri-command-wire
description: >-
  接通 Admin CS Tauri 命令全链路：Rust command → lib.rs handler → src/api invoke → 页面。
  Use when 新 Tauri 命令、album/icloud invoke、src-tauri 与前端联调。
  cargo 警告门禁见 rust-tauri.mdc。Not for HTTP $http 封装。
---

# tauri-command-wire

> **约束权威**：`rust-tauri.mdc`（改完 `cargo check` 0 warning）、`file-naming.mdc`（Rust snake_case）。  
> 样板：`src-tauri/src/album/` + `apps/admin/src/api/album.ts` + `views/album/`

## Trigger

CS invoke 全链路。HTTP CRUD 走 `admin-api-wire`。

## 探测

现有 command 名与 `generate_handler`；Rust 文件 snake_case。

## 步骤

1. 确认画像 `admin-cs`；命令名前后端字符串一致。  
2. `#[tauri::command]`；用户可触发错误用 `Result` 传播。  
3. `mod` 导出 → `lib.rs` `generate_handler![...]`。  
4. `src/api/<feature>.ts`：`invoke("cmd_name", { ... })` + 类型。  
5. UI 调 api；复杂流先对齐 `*Flow.md`；免登壳 → `admin-route-permission`。  
6. 实跑 `cargo check`，修到 0 warning。

## 分叉表

| 情况 | 动作 |
|------|------|
| 新 command | 本 skill 全链路 |
| 只改壳 UI | 勿改 Rust；CS 浮层见 antd rule |
| invoke 返回当数据 | 当外部输入 → `c-defense` |

## FAIL / PASS

```text
FAIL: 同步堵 UI 线程做磁盘/网络；cargo 带 warning 宣称完成
PASS: async command + 0 warning；错误向上抛或明确 UI 提示
```

## 完成检查

- [ ] handler 已注册  
- [ ] invoke 名与参数匹配  
- [ ] `cargo check` 0 warning  
- [ ] 主路径如何手测已说明  

## 反模式 + 交接

- HTTP 与 invoke 混在同一「$http 风格」文件硬套（除非域已如此）。  
- 验收：`c-verify`（admin-cs 行）。
