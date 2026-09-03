---
name: admin-route-permission
description: >-
  处理 @apps/admin 路由与按钮权限：动态菜单 sys_menu、permission store、v-auth/hasPermission、
  本地 local 路由、CS 免登公路径。Use when 新菜单、按钮权限码、动态路由、白名单、album/CS 公路径。
---

# admin-route-permission

> **约束权威**：`vue-admin.mdc`（权限/动态路由）；CS 浮层 → `antd-design-system.mdc`。  
> 动态：`store/modules/permission.ts` + `router/guard.ts` · CS：`router/csPublic.ts` / `router/album.ts`

## 先判定通道

| 场景 | 通道 |
|------|------|
| 后台管理系统页 | **动态菜单**：server `sys_menu` 种子 → 登录后注入路由 |
| 仅本地开发侧栏 | `router/local.ts`（勿当作生产权限真相） |
| Tauri 免登工具页 | **常量路由** `albumConstantRoutes` 等 + `isCsPublicPath` |

## 动态菜单 / 按钮权限

1. 新页面：与后端确认菜单 path、component、perms；种子进 `db/init.sql` 的流程遵循 server 规则（migration 须同意）。  
2. 按钮：`ToolButtons` 的 `authCode` 对应路由 `meta.perms` 后缀；指令 `v-auth`。  
3. 超级管理员 `userId === 1` 跳过校验 — **不要**在业务里再造一套超权。  
4. 禁止硬编码 `true` 绕过、禁止抄相邻页权限码充数；不明则 `c-clarify`。

## CS 公路径

1. 新免登页：加入对应 constant routes，并确保 `isCsPublicPath`（或等价）覆盖，避免被登录守卫拦回。  
2. 仅 Tauri 注入的路由用 `isTauri()` 条件（见 `router/index.ts`）。  
3. 浮层避让：**见** `antd-design-system.mdc`，此处不展开。

## 红线

- 不绕开 `router/guard.ts` 硬跳。  
- 改共享守卫/permission store → 先报共享影响三选一。  
- AI 不得用调试账号暗示已授权业务操作。

## 完成检查

- [ ] 目标通道正确（动态 / local / CS）  
- [ ] 菜单与按钮码和后端一致  
- [ ] 未登录/无权限行为符合预期  
