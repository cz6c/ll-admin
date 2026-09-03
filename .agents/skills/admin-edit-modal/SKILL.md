---
name: admin-edit-modal
description: >-
  组装或修改 @apps/admin 列表内编辑弹窗：a-modal + components/Edit*Form.vue 表单。
  Use when 新增/编辑弹窗、列表页内抽屉或 Modal 表单、EditUserForm 同构改造。
---

# admin-edit-modal

> **约束权威**：`vue-admin.mdc`、`antd-design-system.mdc`（含 CS 浮层避让）。  
> 样板：`apps/admin/src/views/system/user/components/EditUserForm.vue` + 列表页 `a-modal` 接线。

## 结构

```text
views/<domain>/<page>/
  index.vue              # 打开/关闭 modal，传 id / 刷新列表
  components/
    EditXxxForm.vue      # 表单字段、校验、提交 API
```

## 步骤

1. 确认只改**指定列表入口**的弹窗；共享 Form 被多页引用 → 先 anchors 共享三选一。  
2. 列表页：`open` / `recordId` / `@success` 刷新；Modal 用 antd（CS 顶栏避让见 rule，勿抬 z-index 盖壳）。  
3. Form：字段与 DTO/`#/api` 一致；提交调 `add*` / `update*`；成功 `$feedback` + emit。  
4. 只读/禁用态与权限：按钮 `authCode` 在列表 ToolButtons，不在 Form 里伪造超权。  
5. 危险操作：优先 Popconfirm / feedback 约定，勿滥用无上下文大 Modal。

## 红线

- 不为单字段新开整页路由（现有独立详情除外）。  
- 不复制错误模块的字段名；以 server DTO / 现有类型为准。  
- 最小改动：不顺手重构整个 FormView 体系。

## 完成检查

- [ ] 新增/编辑路径均可用  
- [ ] 关闭后列表数据刷新  
- [ ] 校验与错误提示走统一反馈  
