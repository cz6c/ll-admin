---
name: uni-api-http
description: >-
  为 @apps/uni 编写或对齐接口：src/api + src/http（http/alova）、uploadFile 特例、
  类型与拦截器。Use when uni 接 API、改 http 封装、uploadFile、token 拦截、对接后端。
  注意默认基址可能仍是 laf.run，迁移 @apps/server 须单独确认。
---

# uni-api-http

> **约束权威**：`vue-uni.mdc`（HTTP/基址说明）。HTTP：`src/http/http.ts`、`interceptor.ts` · 样板：`salary-verify.ts`；上传：`salary-slip.ts`

## 基址门禁

- 环境：`env/.env*` 的 `VITE_SERVER_BASEURL`。  
- **现状**：可能仍指向 **laf.run**，**未默认对接 `@apps/server`**。  
- 若任务是「迁到 Nest」→ 先 `c-clarify` 确认范围，当作独立迁移，勿在普通加接口任务里默默改基址。

## 步骤（普通 JSON API）

1. 类型放 `src/api/types/` 或邻域 types。  
2. `src/api/<domain>.ts` 调用 `http` / 现有封装，路径与后端约定一致。  
3. Token/401：走 `http` + `interceptor`；勿在页面复制一套登录恢复。  
4. 错误：抛出或返回可 toast 的 message；页面用 `uni.showToast`，勿吞异常（见 `c-defense`）。

## 上传特例

工资条等用 `uni.uploadFile`（见 `salary-slip.ts`）：

- multipart 字段名与后端一致（如 `file`）。  
- `data` 为字符串，须 `JSON.parse`；超时大于服务端 LLM/业务 timeout。  
- 业务码与 `ResultEnum` 对齐。

## 平台差异

`http.ts` 等处已有 `#ifndef MP-WEIXIN` 等；增改时保留并注释 why。

## 红线（流程侧）

- 不把 admin `$http` 习惯硬套进 uni。  
- 不提交 env 密钥 / Swagger dump（anchors 临时产物）。  
- api 层不做 UI；日期工具复用见 `vue-uni.mdc`。
## 完成检查

- [ ] 基址变更已经用户确认（若有）  
- [ ] 类型与错误处理完整  
- [ ] 上传/鉴权特例有注释  
