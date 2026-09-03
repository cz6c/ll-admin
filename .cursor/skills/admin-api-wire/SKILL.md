---
name: admin-api-wire
description: >-
  为 @apps/admin 编写或对齐 HTTP API 薄封装与类型：src/api + #/api，$http.request，
  url 与 Nest 路径一致。Use when 接新接口、改 api 封装、生成前端类型、联调 list/create/update。
---

# admin-api-wire

> **约束权威**：`vue-admin.mdc`（API 层）。样板：`apps/admin/src/api/system/user.ts` · 类型：`#/api/system/user`

## 步骤

1. 确认 server 路径与方法（Controller / Swagger）；**字段名零偏差**，多候选先问。  
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

4. JSDoc 写清业务语义与特殊参数（分页字段、导出格式）；url 与 server 不一致时注释原因。  
5. 页面只调 api 函数，不直接 `$http` 散落（除非域内已有惯例）。

## 与 Tauri 的边界

- **HTTP** → 本 skill。  
- **`invoke`** → `tauri-command-wire`，不要混在同一「$http 风格」文件里硬套，除非域已如此（如 album 独立 `api/album.ts`）。

## 红线

- 禁止 invent 字段或抄兄弟资源近似名。  
- 不把 Swagger 大 JSON 提交进仓库。  
- 不在 api 层做 UI feedback。

## 完成检查

- [ ] 请求方法/路径与 server 一致  
- [ ] Req/Res 类型齐全  
- [ ] 列表/写操作均有对应函数  
