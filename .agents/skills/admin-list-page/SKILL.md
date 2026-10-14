---
name: admin-list-page
description: >-
  组装或修改 @apps/admin 标准列表页：对照 system/user 接线 SearchForm、表格、ToolButtons、字典。
  Use when 新建列表、改查询区/表格列/工具栏。栈与样式约束见 vue-admin / antd-design-system。
  Not for 纯 API 封装（admin-api-wire）或弹窗表单（admin-edit-modal）。
---

# admin-list-page

> **约束权威**：`vue-admin.mdc`、`antd-design-system.mdc`、`comment-standards.mdc`。  
> 原则解说（可选）：[../admin-ui-principles/SKILL.md](../admin-ui-principles/SKILL.md)。  
> 画像：[../c-entry/profiles.md](../c-entry/profiles.md) · 样板：`apps/admin/src/views/system/user/index.vue`

## Trigger

改/建 admin **列表**（查询区、列、工具栏）。无 API 或缺弹窗时交给对应 skill，不在本页堆大表单。

## 探测

打开 user 页同位置写法；类型 `#/api/**`；先 `c-search-first` 看是否已有同构列表。

## 步骤

1. 确认画像 `admin-bs`；无 API 则先 `admin-api-wire` / `nest-crud-module`。  
2. 照抄 user 页：`searchList` → `apiQuery` → columns → `toolbarButtons` → 加载/分页（`useTable` / `useVxetable`）。  
3. 工具栏 `authCode` 与菜单按钮权限对齐；新按钮 → `admin-route-permission`。  
4. 编辑入口 → `admin-edit-modal`。  
5. UI/间距/卡片 shortcut：**打开 rule 对照**，不复述模度表。

## 分叉表

| 情况 | 动作 |
|------|------|
| 只改指定列表 | 只改该 `views/.../index.vue` |
| 共享 SearchForm/列工厂被多页用 | anchors 三选一，未确认不改共享 |
| 还要新接口 | 先 api-wire / nest，再回本页 |

## FAIL / PASS

```text
FAIL: 顺手改相邻业务列表列宽/查询项「对齐」
PASS: 只改指定页；兄弟差异写入范围外报告
```

## 完成检查

- [ ] 查/分页/权限按钮可见性正确  
- [ ] 类型来自 `#/api/**`；url 与 server 一致  
- [ ] 无顺手改兄弟列表  
- [ ] 验证 → `c-verify`（admin lint/typecheck）

## 反模式 + 交接

- 列表里堆完整编辑表单；直调 antd `message`。  
- 下一步：弹窗 `admin-edit-modal`；权限 `admin-route-permission`；验收 `c-verify` → `c-review`。
