# 项目总览

本章用于建立整体认知，帮助你理解这个项目到底是什么，以及 `admin` 和 `server` 分别负责什么。

## 1. 项目定位

`ll-admin` 不是单一前端项目，而是一套后台管理平台骨架。当前最完整的主线是：

- 后端提供认证、权限、菜单、日志、监控、上传、任务等基础能力
- 前端根据后端返回的用户菜单动态渲染后台页面

这意味着它是一个典型的“前后端协作型中后台项目”。

## 2. 当前文档聚焦范围

本文档仅关注两个子项目：

- `apps/server`
- `apps/admin`

## 3. 仓库结构速览

```text
ll-admin/
├─ apps/
│  ├─ admin/    后台管理前端
│  ├─ server/   NestJS 后端
│  └─ uniapp/   移动端模板（本文不展开）
├─ packages/
│  └─ common/   公共工具库
└─ scripts/     一些辅助脚本
```

## 4. 前后端职责边界

### 4.1 server 做什么

- 登录认证
- 刷新 token
- 获取当前登录用户信息
- 根据用户角色返回菜单树
- 提供系统管理类接口
- 提供日志、监控、缓存、上传、任务等基础能力

### 4.2 admin 做什么

- 显示登录页与后台页面
- 保存 token
- 请求后端接口
- 根据菜单接口动态生成路由
- 渲染系统管理、监控等业务页面

## 5. 技术栈概览

### 5.1 server

- `NestJS`
- `TypeORM`
- `MySQL`
- `Redis`
- `Bull`
- `Swagger`
- `Winston`

### 5.2 admin

- `Vue 3`
- `Vite`
- `TypeScript`
- `Element Plus`
- `Pinia`
- `Vue Router`
- `Axios`

## 6. 项目最核心的业务主线

如果只抓一条主线理解整个项目，建议抓下面这条：

1. 用户在 `admin` 登录页输入账号密码
2. `admin` 调用 `server` 的登录接口
3. `server` 校验验证码、用户名密码并返回 token
4. `admin` 保存 token 后调用当前用户信息接口
5. `admin` 再调用菜单接口获取该用户可访问菜单
6. `admin` 根据菜单动态注册路由
7. 用户进入各管理页面继续操作系统功能

## 7. 为什么这个主线重要

因为下面这些能力都围绕这条线展开：

- 登录态管理
- token 刷新
- 菜单权限
- 角色权限
- 页面访问控制
- 接口访问控制

## 8. 你后续最该优先读哪几块

建议按下面顺序理解：

1. 后端的登录与菜单接口
2. 前端的请求封装与路由守卫
3. 前端的动态菜单生成逻辑
4. 后端的角色权限和数据权限
5. 用户、角色、菜单三大基础模块

## 9. 核心目录建议

第一次阅读时优先看这些目录：

### server

- `src/main.ts`
- `src/app.module.ts`
- `src/modules/main`
- `src/modules/system/user`
- `src/modules/system/menu`
- `src/common/guards`

### admin

- `src/main.ts`
- `src/router`
- `src/store/modules/auth.ts`
- `src/store/modules/permission.ts`
- `src/utils/request`
- `src/api/public`

下一章开始进入更具体的开发说明：[后端 server 开发](/guide/server)
