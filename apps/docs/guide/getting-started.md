# 从 0 到 1 快速开始

这一章按真实接手项目的顺序来写，适合第一次启动项目时直接照做。

## 1. 你要先知道什么

本仓库当前最核心、最完整的闭环是：

- `apps/server`：后端服务，负责登录、权限、菜单、用户、角色、部门、日志、监控、上传等能力
- `apps/admin`：后台管理端，负责页面呈现、动态菜单、接口调用、表单与表格交互

本地开发时，推荐先启动后端，再启动前端。

## 2. 环境准备

建议本地具备以下环境：

- `Node.js >= 18`
- `pnpm >= 9`
- `MySQL 8.x`
- `Redis 6.x / 7.x`
- 推荐编辑器：`VS Code`

## 3. 克隆并安装项目

在仓库根目录执行：

```bash
git clone <你的仓库地址>
cd ll-admin
```

由于当前仓库不是根级 `pnpm workspace` 结构，建议分别进入子项目安装依赖。

### 3.1 安装后端依赖

```bash
cd apps/server
pnpm install
```

### 3.2 安装前端依赖

```bash
cd ../admin
pnpm install
```

## 4. 准备数据库

后端默认使用 MySQL，并提供了初始化 SQL：

- 初始化文件：`apps/server/db/init.sql`

操作步骤：

1. 在本地创建一个数据库，例如 `loca_test`
2. 使用数据库工具导入 `init.sql`
3. 确认基础表、菜单、用户、角色等初始数据已导入成功

## 5. 准备 Redis

后端依赖 Redis 提供以下能力：

- 验证码缓存
- 登录态缓存
- 分布式锁
- 队列相关基础能力

请确认本地 Redis 已启动，并记住连接参数。

## 6. 配置后端开发环境

后端开发配置文件位于：

- `apps/server/src/config/dev.yml`

你至少要检查这些配置项：

- `app.port`
- `db.mysql.host`
- `db.mysql.username`
- `db.mysql.password`
- `db.mysql.database`
- `redis.host`
- `redis.password`
- `redis.port`

如果你的本地 MySQL 或 Redis 与默认配置不一致，请先改这里。

## 7. 启动后端

进入后端目录执行：

```bash
cd apps/server
pnpm start:dev
```

启动成功后，通常会看到类似信息：

- 服务地址：`http://localhost:6060/`
- Swagger 地址：`http://localhost:6060/swagger-ui/`

说明：当前开发环境配置里 `app.prefix` 为空，所以接口前缀默认是根路径。

## 8. 配置前端开发环境

前端环境变量主要在以下文件中：

- `apps/admin/.env`
- `apps/admin/.env.development`

你需要重点确认：

- `VITE_BASE_URL` 是否指向本地后端地址
- 代理配置是否符合当前联调方式

如果你使用的是本地后端开发地址，通常应让前端请求能访问到 `server` 启动端口。

## 9. 启动前端

进入前端目录执行：

```bash
cd apps/admin
pnpm dev
```

启动后浏览器会打开本地地址，进入登录页即可开始验证联调是否成功。

## 10. 首次联调验证清单

按下面顺序检查：

1. 打开登录页是否正常
2. 验证码是否能正常加载
3. 输入账号密码后是否登录成功
4. 登录后首页是否正常跳转
5. 左侧菜单是否成功渲染
6. 用户、角色、菜单等页面列表是否能拉取数据
7. Swagger 是否能访问

## 11. 默认账号建议

如果你导入的是项目默认初始化数据，可以优先尝试：

```text
账号：admin
密码：123456
```

如果无法登录，以你实际导入的数据库用户数据为准。

## 12. 启动顺序建议

推荐始终按这个顺序启动：

1. `MySQL`
2. `Redis`
3. `apps/server`
4. `apps/admin`

## 13. 你现在已经完成了什么

走完本章后，你已经具备了以下基础：

- 本地可以独立拉起前后端
- 知道数据库与 Redis 在项目中的作用
- 知道配置文件该改哪里
- 知道如何确认联调成功

下一步建议继续阅读：[项目总览](/guide/project-overview)
