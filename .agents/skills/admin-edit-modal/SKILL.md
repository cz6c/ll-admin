---
name: admin-edit-modal
description: >-
  组装或修改 @apps/admin 列表内编辑弹窗：CcDialog + components/Edit*Form.vue 表单。
  Use when 新增/编辑弹窗、列表页内抽屉或 Modal 表单、EditUserForm 同构改造。
  Not for 静态确认（走 $feedback.confirm）或整页详情路由。
---

# admin-edit-modal

> **约束权威**：`vue-admin.mdc`、`antd-design-system.mdc`（含 CS 浮层避让、`$feedback`）。  
> 原则解说（可选）：[../admin-ui-principles/SKILL.md](../admin-ui-principles/SKILL.md)。  
> 样板：`apps/admin/src/views/system/user/components/EditUserForm.vue` + 列表页弹窗接线。

## Trigger

列表内新增/编辑弹窗。静态确认不用本 skill。

## 探测

样板 Form + 列表打开方式；业务弹窗须 **`CcDialog`**（禁止业务页直写 `<a-modal>`，见 `vue-admin.mdc`）。

## 结构

```text
views/<domain>/<page>/
  index.vue              # 打开/关闭，传 id / 刷新列表
  components/
    EditXxxForm.vue      # 字段、校验、提交 API
```

## 步骤

1. 确认只改**指定列表入口**；共享 Form 多页引用 → anchors 三选一。  
2. 列表：`open` / `recordId` / `@success` 刷新；CS 顶栏避让见 rule，勿抬 z-index 盖壳。  
3. Form：字段与 DTO/`#/api` 一致；提交与提示在 Form 内完成，结果用事件交给列表刷新。  
4. 按钮 `authCode` 在列表 ToolButtons，不在 Form 里伪造超权。  
5. 危险操作：Popconfirm / `$feedback`，勿滥用无上下文大 Modal。

## 分叉表

| 情况 | 动作 |
|------|------|
| 列表内编辑 | 本 skill + `CcDialog` |
| 一次消费确认 | `$feedback.confirm` |
| 已有独立详情路由 | 不改为弹窗，除非用户点名 |

## FAIL / PASS

```text
FAIL: import { message, Modal } from "ant-design-vue"; Modal.confirm(...)
PASS: $feedback.confirm / $feedback.message；壳层 CcDialog
```

## 完成检查

- [ ] 新增/编辑路径均可用  
- [ ] 关闭后列表刷新  
- [ ] 校验与错误走统一反馈  

## 反模式 + 交接

- 为单字段新开整页；复制错误模块字段名。  
- 下一步：`c-verify` → `c-review`。
