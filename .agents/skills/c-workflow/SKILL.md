---
name: c-workflow
description: >-
  tsb monorepo 改代码工作流：任务概览、要改/不改蓝图、必问单选、纠错复原、最小充分实现、
  范围外报告。Use when 改代码、修 bug、新需求、删功能、蓝图、最小改动、用户纠错、擅自扩展。
  可由 c-page 路由进入；非页面类改代码也可直接使用。
---

# c-workflow

> 入口：[../c-page/SKILL.md](../c-page/SKILL.md) · 画像：[../c-page/profiles.md](../c-page/profiles.md) · 锚点：[../c-page/anchors.md](../c-page/anchors.md) · 细则：[reference.md](reference.md)

## 前置

- 产品/原型混写 → 先 `c-requirement`。
- 歧义/绕过 → 先 `c-clarify`；未放行不写代码。
- 先读 profiles 判定画像。

## 对话蓝图（写代码前）

用户说「直接改」时，只能省略**展示型**蓝图，**不得**省略 anchors 关卡。否则按序：

1. **问题详述** — 现象/根因/涉及端与模块  
2. **结论** — 处理方向  
3. **蓝图** — **要改 / 不改** 清单  

模板见 [reference.md](reference.md)。

## 纠错

命中「不是这个需求 / 多加了 / 超出范围」→ 立即按 anchors **纠错复原协议** 处理。

## 改代码前必问（用户已说明则跳过）

| # | 问题 | 说明 |
|---|------|------|
| 1 | Bug 还是新需求？ | 分流下面流程 |
| 2 | 改哪一端？ | admin-bs / admin-cs / server / uni / 全链路 |
| 3 | 共享影响？ | 全局 / 参数区分 / 只改入口 |
| 4 | 是否动表结构？ | 是则提醒：migration **须用户明确同意** 才落盘 |

## Bug 修复

1. 找根因，不只改表象。  
2. Grep 同 API/字段/兄弟入口。  
3. 对照 profiles 标准样板同位置写法。  
4. **最简代码**；不顺手重构。  
5. 验证：原问题 OK、关联同步、无新增 lint/类型错误；改 Tauri 则 `cargo check` 0 warning。

## 新需求

1. 确认范围与画像。  
2. 按场景读装配 skill（list / modal / api / nest / tauri / route）。  
3. 命名与路径、注释门禁分别遵守 `file-naming.mdc`、`comment-standards.mdc`（**不在此复述**）。
4. Rules vs Skills 边界见 `skill-rule-boundary.mdc`。
5. 默认不抽离新抽象（问用户后再抽）。
## 复杂度预算

局部问题局部修。写前问：删掉新文件/新依赖/新抽象后能否同样解决问题？能则选更简单方案。细则 → [reference.md](reference.md)。

## 交付复核

- 已改文件  
- 范围外发现（未改）  
- 实际跑过的验证命令与结果  
- 待用户确认项（权限码、菜单种子、migration 等）
