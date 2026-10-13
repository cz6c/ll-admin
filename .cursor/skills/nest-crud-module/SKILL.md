---
name: nest-crud-module
description: >-
  在 @apps/server 新建或扩展 Nest CRUD 模块：按 dept 样板装配 module/controller/service/dto/entity，
  并与 admin API 路径对齐。Use when 新后端模块、加接口、对照 dept 样板。
  Entity/migration/逻辑外键等约束以 nestjs-server.mdc 为准。
---

# nest-crud-module

> **约束权威**：`nestjs-server.mdc`（Entity、逻辑外键、plugins vs 业务、migration/init **全文只在那里**）。  
> 样板：`apps/server/src/modules/system/dept/`

## Trigger

新建/扩展 Nest CRUD。OCR/VLM 等通用能力进 `plugins/`，不进业务 module。

## 探测

对照 `dept/` 文件集；路径与 admin `src/api` 对齐；表结构变更 **先问**。

## 步骤

1. 确认域目录 `src/modules/<domain>/`。  
2. 建/改：`*.module.ts` · `*.controller.ts` · `*.service.ts` · `dto/` · `entities/`（形态照抄 dept）。  
3. Controller 装饰器与路径与 admin `src/api` 对齐。  
4. DTO 字段与前端 `apiQuery`/表单对齐；多候选先问。  
5. 注册到父 Module。  
6. 涉及表结构：未明确同意 → **不落** `src/migrations/*.ts`。

## 分叉表

| 情况 | 动作 |
|------|------|
| 只加接口字段 | 改 DTO/service；开发中可只改 Entity+构思 init.sql |
| 用户同意收口 | 一条 migration + 同步 init.sql 终态 |
| 通用 SDK | `src/plugins/`，业务只编排 |

## FAIL / PASS

```text
FAIL: 对话中途自行 pnpm migration:generate 并提交
PASS: 回复里询问；仅当用户说「生成迁移」后落盘
```

## 完成检查

- [ ] 接口可在 Swagger 见  
- [ ] 与 admin url 约定一致  
- [ ] 未擅自添加 migration  
- [ ] 已对照 `nestjs-server.mdc`  

## 反模式 + 交接

- `@ManyToOne` / 库级 FK；业务 module 里写厂商 SDK。  
- 下一步：admin `admin-api-wire`；验收 `c-verify`（server）。
