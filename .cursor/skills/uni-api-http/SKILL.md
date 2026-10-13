---
name: uni-api-http
description: >-
  为 @apps/uni 编写或对齐接口：src/api + src/http（http/alova）、uploadFile 特例、
  类型与拦截器。Use when uni 接 API、改 http 封装、uploadFile、token 拦截、对接后端。
  默认基址可能仍是 laf.run，迁移 @apps/server 须单独确认。
---

# uni-api-http

> **约束权威**：`vue-uni.mdc`（HTTP/基址说明）。HTTP：`src/http/http.ts`、`interceptor.ts` · 样板：`salary-verify.ts`；上传：`salary-slip.ts`

## Trigger

uni JSON API / 上传 / 拦截器。不要套 admin `$http`。

## 探测

`env/` 的 `VITE_SERVER_BASEURL`；确认是否仍指向 laf.run。

## 基址门禁

- **现状**：可能仍指向 **laf.run**，**未默认对接 `@apps/server`**。  
- 「迁到 Nest」→ 先 `c-clarify`，勿在普通加接口任务里改基址。

## 步骤（普通 JSON API）

1. 类型放 `src/api/types/` 或邻域 types。  
2. `src/api/<domain>.ts` 调 `http` / 现有封装，路径与后端约定一致。  
3. Token/401：走 `http` + `interceptor`；勿在页面复制登录恢复。  
4. 错误：可 toast 的 message；页面 `uni.showToast`，勿吞异常（`c-defense`）。

## 上传特例

见 `salary-slip.ts`：`uni.uploadFile`；multipart 字段名；`data` 须 `JSON.parse`；超时大于服务端 LLM/业务 timeout；业务码对齐 `ResultEnum`。

## 平台差异

`#ifndef MP-WEIXIN` 等须保留并注释 why。

## 分叉表

| 情况 | 动作 |
|------|------|
| 加接口、基址不变 | 本 skill |
| 改 VITE_SERVER_BASEURL | 独立迁移，先问 |
| 上传 | 走 uploadFile 特例，不硬套 JSON http |

## FAIL / PASS

```text
FAIL: 页面再写一套 token 刷新；或顺手把基址改成 Nest
PASS: 拦截器统一处理；基址变更有用户确认
```

## 完成检查

- [ ] 基址变更已经用户确认（若有）  
- [ ] 类型与错误处理完整  
- [ ] 上传/鉴权特例有注释  

## 反模式 + 交接

- 提交 env 密钥 / Swagger dump。  
- 验收：`c-verify`（uni 单独 filter）。
