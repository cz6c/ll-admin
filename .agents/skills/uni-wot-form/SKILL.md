---
name: uni-wot-form
description: >-
  在 @apps/uni 用 wot-ui 组装表单：wd-form + model + schema、提交前 formRef.validate()。
  Use when uni 表单、校验、wd-form、schema。控件选型与禁原生控件见 vue-uni.mdc。
---

# uni-wot-form

> **约束权威**：`vue-uni.mdc`（wot-ui 对照表、语义色、Uno/rpx）。本 skill 只给装配步骤。  
> 样板：`pages-sub/wifi/generate.vue`；复杂业务参考 `pages/salary/calc.vue`

## 步骤

1. `formModel` + `FormSchema`（`validate` / `isRequired`）+ `formRef: FormExpose`。  
2. 模板：`wd-form` 绑 model/schema + `ref`；字段 `wd-form-item` + wot 控件（**选型见 rule，此处不重复表**）。  
3. 提交：`const { valid } = await formRef.value!.validate()`；失败直接 return。  
4. easycom 已配置，勿手动 import 组件。  
5. 自定义 TabBar 页弹层注意 z-index（见 calc 的 `popupZIndex`）。  
6. 非标准校验、与后端字段转换 → 按 `comment-standards` 写 why。

## 完成检查

- [ ] 提交前调用了 `validate()`  
- [ ] 未用原生 button/input 造业务表单（rule）  
- [ ] 错误提示用户可读  
