---
name: uni-wot-form
description: >-
  在 @apps/uni 用 wot-ui 组装表单：wd-form + model + schema、提交前 formRef.validate()。
  Use when uni 表单、校验、wd-form、schema。控件选型与禁原生控件见 vue-uni.mdc。
---

# uni-wot-form

> **约束权威**：`vue-uni.mdc`（wot-ui 对照表、语义色、Uno/rpx）。本 skill 只给装配步骤。  
> 样板：`pages-sub/wifi/generate.vue`；复杂业务参考 `pages/salary/calc.vue`

## Trigger

uni 业务表单校验与提交。控件对照表只在 rule。

## 探测

打开 generate.vue 的 `formModel` + schema；easycom 已配置则勿手写 import。

## 步骤

1. `formModel` + `FormSchema` + `formRef: FormExpose`。  
2. `wd-form` 绑 model/schema；字段 `wd-form-item` + wot 控件。  
3. 提交：`const { valid } = await formRef.value!.validate()`；失败直接 return。  
4. 自定义 TabBar 页弹层注意 z-index（见 calc 的 `popupZIndex`）。  
5. 非标准校验、与后端字段转换 → `comment-standards` 写 why。

## 分叉表

| 情况 | 动作 |
|------|------|
| 标准表单 | 本 skill |
| 原生 input 造业务表单 | 禁止（rule） |
| 接口字段不一致 | 转换写在 script 并注释 why |

## FAIL / PASS

```text
FAIL: 提交不调 validate，或用原生 button/input 做主表单
PASS: validate() 失败即 return；控件走 wd-*
```

## 完成检查

- [ ] 提交前 `validate()`  
- [ ] 未用原生控件造业务表单  
- [ ] 错误提示用户可读  

## 反模式 + 交接

- 在 skill 里复制 wot 对照表（去 rule 看）。  
- 接口 → `uni-api-http`。
