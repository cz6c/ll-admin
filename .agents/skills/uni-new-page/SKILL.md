---
name: uni-new-page
description: >-
  在 @apps/uni 新建或调整页面：主包/分包选择、definePage 字面量、勿手改 pages.json、
  生命周期与跳转接线。Use when 新建 uni 页、改路由标题、主包/分包、tabBar、definePage。
  样式/wot/日期等约束见 vue-uni.mdc。
---

# uni-new-page

> **约束权威**：`vue-uni.mdc`。本 skill 只给开页流程。  
> 样板：`pages/salary/calc.vue`、`pages-sub/wifi/generate.vue`

## Trigger

新建/改 uni 页面路由与生命周期。表单/HTTP 交给对应 skill。

## 探测

主包 `src/pages/**` vs 分包 `src/pages-sub/**`；不定 → `c-clarify`。

## 步骤

1. 定主包/分包。  
2. 建 `*.vue`：`defineOptions` + **`definePage` 字面量**（勿用导入常量）。  
3. **禁止**手改/提交 `pages.json` / `manifest.json`。  
4. `onLoad` / `onShow` / `onReady`；跳转 `uni.navigateTo` / `redirectTo`。  
5. 登录白名单：`src/router/interceptor.ts`；Tab：`src/tabbar/config.ts`。  
6. 表单 → `uni-wot-form`；接口 → `uni-api-http`。  
7. `#ifdef` 须注释为何分平台。

## 分叉表

| 情况 | 动作 |
|------|------|
| 主包 vs 分包未定 | `c-clarify` |
| 只改标题/路由元数据 | 改 `definePage` 字面量 |
| 迁基址到 Nest | 独立任务，勿夹在开页里 |

## FAIL / PASS

```text
FAIL: 手改 apps/uni/src/pages.json 并提交
PASS: 只改页面内 definePage 字面量
```

## 完成检查

- [ ] `definePage` 字面量，未手改 `pages.json`  
- [ ] 主包/分包正确  
- [ ] `#ifdef` 有 why  

## 反模式 + 交接

- 把 admin `$http` / antd 习惯套进 uni。  
- 验收：`c-verify`（**仅** uni filter，不默认 `pnpm check`）。
