---
name: admin-route-permission
description: >-
  处理 @apps/admin 路由与按钮权限：动态菜单 sys_menu、permission store、v-auth/hasPermission、
  本地 local 路由、CS 免登公路径。Use when 新菜单、按钮权限码、动态路由、白名单、album/CS 公路径。
  Not for 猜权限码或硬编码 true 绕过。
---

# admin-route-permission

> **约束权威**：`vue-admin.mdc`（权限/动态路由）；CS 浮层 → `antd-design-system.mdc`。  
> 动态：`store/modules/permission.ts` + `router/guard.ts` · CS：`router/csPublic.ts` / `router/album.ts`

## Trigger

新菜单、按钮码、动态路由、CS 免登。权限码不明 → `c-clarify`，禁止抄邻页。

## 探测

先判定通道（下表）；读现有 `meta.perms` / `sys_menu` 种子，不发明码。

## 先判定通道

| 场景 | 通道 |
|------|------|
| 后台管理系统页 | **动态菜单**：server `sys_menu` 种子 → 登录后注入路由 |
| 仅本地开发侧栏 | `router/local.ts`（勿当作生产权限真相） |
| Tauri 免登工具页 | **常量路由** `albumConstantRoutes` 等 + `isCsPublicPath` |

## 动态菜单 / 按钮权限

1. 新页面：与后端确认菜单 path、component、perms；种子进 `init.sql` 遵循 server 规则（migration 须同意）。  
2. 按钮：`ToolButtons` 的 `authCode` 对应路由 `meta.perms` 后缀；指令 `v-auth`。  
3. 超级管理员 `userId === 1` 跳过校验 — **不要**在业务里再造一套超权。  
4. 禁止硬编码 `true` 绕过。

## CS 公路径

1. 新免登页：加入 constant routes，并确保 `isCsPublicPath` 覆盖。  
2. 仅 Tauri 注入的路由用 `isTauri()`（见 `router/index.ts`）。  
3. 浮层避让见 `antd-design-system.mdc`。

## 分叉表

| 情况 | 动作 |
|------|------|
| 码未定 | `c-clarify`，不写 v-auth 占位假码 |
| 改 permission store / guard | 共享三选一 |
| 菜单种子要动表 | server rule；未同意不落 migration |

## FAIL / PASS

```text
FAIL: authCode: "system:user:edit" 抄到无关新页
PASS: 与后端确认的 perms 一致；不明则待确认
```

## 完成检查

- [ ] 通道正确（动态 / local / CS）  
- [ ] 菜单与按钮码和后端一致  
- [ ] 未登录/无权限行为符合预期  

## 反模式 + 交接

- 绕开 `router/guard.ts` 硬跳；用调试身份暗示已授权。  
- 下一步：列表接线 `admin-list-page`。
