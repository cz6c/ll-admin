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

## 步骤（流程）

1. 确认域目录 `src/modules/<domain>/`。  
2. 建/改：`*.module.ts` · `*.controller.ts` · `*.service.ts` · `dto/` · `entities/`（形态照抄 dept）。  
3. Controller 装饰器与路径与 admin `src/api` 对齐。  
4. DTO 字段与前端 `apiQuery`/表单对齐；多候选字段先问。  
5. 注册到父 Module（按域现有方式）。  
6. 涉及表结构：**先问**用户是否生成 migration；未明确同意 → **不落** `src/migrations/*.ts`（细则见 rule）。

## 完成检查

- [ ] 接口可在 Swagger 见  
- [ ] 与 admin url 约定一致  
- [ ] 未擅自添加 migration  
- [ ] 约束项已对照 `nestjs-server.mdc`（非本 skill 复述）
