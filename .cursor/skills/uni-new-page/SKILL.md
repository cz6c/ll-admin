---
name: uni-new-page
description: >-
  在 @apps/uni 新建或调整页面：主包/分包选择、definePage 字面量、勿手改 pages.json、
  生命周期与跳转接线。Use when 新建 uni 页、改路由标题、主包/分包、tabBar、definePage。
  样式/wot/日期等约束见 vue-uni.mdc。
---

# uni-new-page

> **约束权威**：`vue-uni.mdc`（生成文件、样式 rpx、wot、日期、注释）。本 skill 只给开页流程。  
> 样板：`pages/salary/calc.vue`、`pages-sub/wifi/generate.vue`

## 步骤

1. 定位置：`src/pages/**`（主包）还是 `src/pages-sub/**`（分包）；不定 → `c-clarify`。  
2. 建 `*.vue`：`defineOptions` + **`definePage` 字面量**（勿用导入常量，见 legal 页注释）。  
3. **禁止**手改/提交 `pages.json` / `manifest.json`；改路由用 `definePage` 或 `pages.config.ts`。  
4. 生命周期：`onLoad` / `onShow` / `onReady` 等；跳转 `uni.navigateTo` / `redirectTo`。  
5. 登录白名单：`src/router/interceptor.ts`；Tab：`src/tabbar/config.ts`。  
6. 表单页转 `uni-wot-form`；接口转 `uni-api-http`。  
7. `#ifdef`：须注释为何分平台（rule 要求）；样式/组件选型打开 `vue-uni.mdc` 对照，不在此展开。

## 完成检查

- [ ] `definePage` 字面量，未手改 `pages.json`  
- [ ] 主包/分包正确  
- [ ] 相关 `#ifdef` 有 why  
- [ ] 样式/wot 已按 `vue-uni.mdc` 自检  
