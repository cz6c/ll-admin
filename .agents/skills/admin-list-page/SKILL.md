---
name: admin-list-page
description: >-
  组装或修改 @apps/admin 标准列表页：对照 system/user 接线 SearchForm、表格、ToolButtons、字典。
  Use when 新建列表、改查询区/表格列/工具栏。栈与样式约束见 vue-admin / antd-design-system。
---

# admin-list-page

> **约束权威**：`vue-admin.mdc`、`antd-design-system.mdc`、`comment-standards.mdc`。  
> 画像：[../c-page/profiles.md](../c-page/profiles.md) · 样板：`apps/admin/src/views/system/user/index.vue`

## 步骤

1. 确认画像 `admin-bs`；无 API 则先 `admin-api-wire` / `nest-crud-module`。  
2. 照抄 user 页装配顺序：`searchList` → `apiQuery` → columns → `toolbarButtons` → 加载/分页（`useTable` / `useVxetable`）。  
3. 工具栏 `authCode` 与菜单按钮权限对齐；新按钮 → `admin-route-permission`。  
4. 编辑入口 → `admin-edit-modal`，勿在列表堆大表单。  
5. UI/间距/卡片 shortcut：**打开 rule 对照**，本 skill 不复述模度表。

## 完成检查

- [ ] 查/分页/权限按钮可见性正确  
- [ ] 类型来自 `#/api/**`；url 与 server 一致  
- [ ] 无顺手改兄弟列表  
