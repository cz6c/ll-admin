---
name: admin-api-wire
description: >-
  为 @apps/admin 编写或对齐 HTTP API 薄封装与类型：src/api + #/api，$http.request，
  url 与 Nest 路径一致。Use when 接新接口、改 api 封装、生成前端类型、联调 list/create/update。
  Not for Tauri invoke（tauri-command-wire）或在 api 层做 UI feedback。
---

# admin-api-wire

> **约束权威**：`vue-admin.mdc`（API 层）。样板：`apps/admin/src/api/system/user.ts` · 类型：`#/api/system/user`

## Trigger

Admin HTTP 薄封装 / 类型对齐。CS `invoke` 走 `tauri-command-wire`。

## 探测

Controller / Swagger 路径与方法；对照 `user.ts` 函数形态。字段名多候选 → `c-clarify`。

## 步骤

1. 确认 server 路径与方法；**字段名零偏差**。  
2. 类型放 `types/api/**` 或 `#/api/**`（与现有域一致）。  
3. `src/api/<domain>/<resource>.ts`：

```ts
export function listXxx(params: XxxListParams) {
  return $http.request<never, XxxListResponse>({
    url: `/system/xxx/list`,
    method: "get",
    params
  });
}
```

4. JSDoc 写清业务语义与特殊参数；url 与 server 不一致时注释原因。  
5. 页面只调 api 函数，不直接 `$http` 散落（除非域内已有惯例）。

## 分叉表

| 情况 | 动作 |
|------|------|
| HTTP CRUD | 本 skill |
| `invoke` | `tauri-command-wire`（如 album 独立 `api/album.ts`） |
| 后端尚无接口 | 先 nest-crud 或标待确认，禁止 invent 字段 |

## FAIL / PASS

```ts
// FAIL: 抄邻域近似字段
export interface FooListParams { user_name: string }

// PASS: 与 DTO / #/api 一致
export interface FooListParams { userName: string }
```

## 完成检查

- [ ] 方法/路径与 server 一致  
- [ ] Req/Res 类型齐全  
- [ ] 列表/写操作均有对应函数  

## 反模式 + 交接

- Swagger dump 进仓库；api 层 `$feedback`。  
- 下一步：列表 `admin-list-page`；弹窗 `admin-edit-modal`。
