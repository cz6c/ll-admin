# Skills 索引（tsb monorepo）

项目 skill 放在 **`.cursor/skills/`**（Cursor 官方发现路径）。本仓另有 **`.agents/skills/`** 同步副本；**改 skill 时两处一起改**。

## 边界主旨（强制）

> **命名 / 注释 / 栈约定 → Rules**（`.cursor/rules/`）  
> **流程 / 步骤 / 样板接线 → Skills**（本目录）

全仓权威：`.cursor/rules/skill-rule-boundary.mdc`。新增或修改 rule/skill 前先读该文件。

- 约束全文只在 rule；skill 只写 **一句门禁提醒 + 规则名**，禁止再贴对照表。  
- 流程、必问、完成检查只在 skill；不要写进 rule。

## 入口与治理

| 任务 | Skill |
|------|--------|
| 不确定用哪个 / 跨端路由 | [c-page](c-page/SKILL.md) |
| 歧义 / 绕过确认 | [c-clarify](c-clarify/SKILL.md) |
| 蓝图 / 最小改动 / 纠错 | [c-workflow](c-workflow/SKILL.md) |
| 产品需求拆分 | [c-requirement](c-requirement/SKILL.md) |
| 防御设在哪里 | [c-defense](c-defense/SKILL.md) |

单一事实源（流程侧）：[profiles](c-page/profiles.md) · [anchors](c-page/anchors.md)

## 装配（Admin / Server / Tauri / Uni）

| 任务 | Skill | 约束权威（勿在 skill 复制） |
|------|--------|---------------------------|
| 标准列表页 | [admin-list-page](admin-list-page/SKILL.md) | `vue-admin` · `antd-design-system` |
| 编辑弹窗 | [admin-edit-modal](admin-edit-modal/SKILL.md) | 同上 |
| HTTP API 薄封装 | [admin-api-wire](admin-api-wire/SKILL.md) | `vue-admin` |
| 路由 / 菜单 / 权限 | [admin-route-permission](admin-route-permission/SKILL.md) | `vue-admin` |
| Nest CRUD 模块 | [nest-crud-module](nest-crud-module/SKILL.md) | `nestjs-server` |
| Tauri invoke 全链路 | [tauri-command-wire](tauri-command-wire/SKILL.md) | `rust-tauri` · `file-naming` |
| Uni 新页面 | [uni-new-page](uni-new-page/SKILL.md) | `vue-uni` |
| Uni wot 表单 | [uni-wot-form](uni-wot-form/SKILL.md) | `vue-uni` wot 节 |
| Uni HTTP / API | [uni-api-http](uni-api-http/SKILL.md) | `vue-uni` |

## 设计 / 动画（已有）

`animation-vocabulary` · `apple-design` · `emil-design-eng` · `find-animation-opportunities` · `improve-animations` · `review-animations` · `prototype` · `pick-ui-library`

## 推荐阅读顺序（新功能）

`c-page` →（必要时 `c-requirement` / `c-clarify`）→ `c-workflow` → 装配 skill → **按对应 app rule 验收约束**。
