# ll-admin 开发使用文档

面向 `apps/admin` 与 `apps/server` 的开发文档站，目标是帮助新同事从 `0` 到 `1` 完成本地启动、理解架构、掌握核心模块并具备二次开发能力。

## 这份文档解决什么问题

- 不清楚项目由哪些部分组成
- 第一次接手，不知道先启动前端还是后端
- 不知道数据库、Redis、配置文件分别要怎么准备
- 可以跑起来，但不了解登录、菜单、权限、上传、监控这些核心能力
- 想新增一个页面或一个接口，不知道该从哪一层开始改

## 文档范围

- 仅覆盖 `apps/admin`
- 仅覆盖 `apps/server`
- 不展开 `apps/uniapp`
- 不展开 `packages/common` 的源码细节，只在需要时说明其用途

## 推荐阅读顺序

1. [从 0 到 1 快速开始](/guide/getting-started)
2. [项目总览](/guide/project-overview)
3. [后端 server 开发](/guide/server)
4. [前端 admin 开发](/guide/admin)
5. [前后端联调主线](/guide/full-link)
6. [部署指南](/guide/deployment)
7. [核心功能地图](/guide/feature-map)
8. [常见问题](/guide/faq)

## 文档目标

读完后你应当能够：

- 独立完成本地环境准备
- 独立启动 `server` 与 `admin`
- 看懂登录、菜单、权限、请求封装的主流程
- 能按现有模式新增后端接口与前端页面
- 能快速定位常见联调与配置问题

## 本地运行文档站

在 `apps/docs` 目录下执行：

```bash
pnpm install
pnpm dev
```

构建静态站点：

```bash
pnpm build
pnpm preview
```
