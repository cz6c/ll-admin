# 后端 server 开发

本章从开发者视角介绍 `apps/server` 的目录、启动流程、配置方式、模块设计以及如何扩展新功能。

## 1. 后端的职责

`server` 是整个项目的平台能力中心，核心职责包括：

- 认证与登录
- 菜单与权限
- 系统管理数据维护
- 监控与日志
- 文件上传
- Redis 缓存能力
- 队列任务与定时任务
- Swagger 接口文档输出

## 2. 目录结构说明

```text
apps/server/
├─ db/                 数据初始化 SQL
├─ src/
│  ├─ common/          通用能力：守卫、装饰器、异常、工具
│  ├─ config/          配置文件与 TypeORM 配置
│  ├─ modules/         业务模块
│  ├─ plugins/         插件能力，如 MQTT、邮件、HTTP
│  ├─ app.module.ts    应用总模块
│  └─ main.ts          启动入口
└─ package.json
```

## 3. 启动入口做了什么

`src/main.ts` 主要完成这些工作：

- 创建 Nest 应用
- 注册日志系统
- 启用 CORS
- 配置限流
- 设置全局接口前缀
- 注册异常过滤器
- 注册参数校验管道
- 配置 Helmet
- 生成 Swagger 文档
- 监听优雅关闭逻辑

因此，如果你想理解项目全局行为，优先看 `main.ts`。

## 4. 配置文件如何加载

当前配置走的是按环境加载 YAML 文件的模式。

### 4.1 关键位置

- `src/config/index.ts`
- `src/config/dev.yml`

### 4.2 基本规则

- `development` 环境读取 `dev.yml`
- `production` 环境读取 `prod.yml`
- `test` 环境读取 `test.yml`

### 4.3 开发最常改的配置

- 端口
- MySQL 连接
- Redis 连接
- 文件上传路径
- JWT 密钥
- 白名单接口

## 5. 模块是如何划分的

后端采用 Nest 常见的按业务域划分模块方式。

### 5.1 平台公共接口

- `modules/main`

负责：

- 登录
- 注册
- 刷新 token
- 验证码
- 获取当前用户信息
- 获取当前用户菜单
- 获取字典

### 5.2 系统管理模块

- `modules/system/user`
- `modules/system/role`
- `modules/system/menu`
- `modules/system/dept`
- `modules/system/post`
- `modules/system/config`
- `modules/system/notice`

### 5.3 监控模块

- `modules/monitor/loginlog`
- `modules/monitor/operlog`
- `modules/monitor/cache`
- `modules/monitor/server`

### 5.4 其他基础模块

- `modules/upload`
- `modules/tasks`
- `modules/redis`
- `modules/area`
- `modules/pushtask`

## 6. 登录和认证机制

这是后端最核心的链路。

### 6.1 登录流程

1. 前端调用 `/login`
2. 后端校验验证码
3. 后端校验账号密码
4. 后端生成 JWT
5. 后端查询用户角色
6. 后端把完整登录态写入 Redis
7. 返回 token 给前端

### 6.2 为什么 JWT 外还要 Redis

因为项目不是只靠纯 JWT 识别用户，而是：

- JWT 只负责携带 `uuid`、`userId`
- Redis 保存完整登录态，包括用户信息、角色、登录时间、浏览器、IP 等

这样更方便做权限扩展与会话管理。

## 7. 权限机制怎么理解

项目里的权限分两层：

### 7.1 登录认证

通过全局 `JwtAuthGuard` 校验：

- 当前接口是否在白名单
- 请求是否带 `Authorization`
- token 是否有效

### 7.2 角色权限

通过全局 `RolesGuard` 校验：

- 某些接口上会用 `@RequireRole('admin')`
- 当前用户角色列表中若不含目标角色，则禁止访问

## 8. 菜单机制怎么理解

菜单不仅是前端 UI 数据，也是权限系统的一部分。

后端会根据：

- 用户 ID
- 用户绑定角色
- 角色绑定菜单

最终构造出前端可直接使用的菜单树，并由 `/getRouters` 返回给前端。

## 9. 统一返回结构

后端接口统一返回：

```json
{
  "code": 200,
  "msg": "操作成功",
  "data": {}
}
```

这件事很重要，因为前端请求封装、错误提示、token 刷新逻辑都是围绕这个结构实现的。

## 10. 数据层如何工作

项目使用 `TypeORM`，基本组织方式如下：

- `entities`：数据库实体
- `dto`：入参、出参约束
- `controller`：接收请求
- `service`：处理业务逻辑

建议新增功能时尽量沿用当前组织模式，不要跨层写业务。

## 11. 如何新增一个后端模块

推荐步骤：

1. 在 `src/modules` 下新建业务目录
2. 新建 `module`、`controller`、`service`
3. 新建 `dto` 与 `entities`
4. 在 `app.module.ts` 中注册模块
5. 加上 Swagger 注解
6. 保持统一返回结构
7. 如需权限控制，加守卫或角色装饰器

## 12. Swagger 的用途

项目启动后会生成 Swagger 文档，主要作用是：

- 便于前后端联调
- 便于手工验证接口
- 为类型生成提供输入

开发环境下还会生成 `swagger.json`，供前端类型生成工具使用。

## 13. Redis 在项目中的几个关键用途

- 验证码缓存
- 登录态缓存
- 分布式锁
- 队列配套能力
- 缓存监控页面数据来源

## 14. 上传能力说明

上传模块支持：

- 普通文件上传
- 分片上传
- 分片合并
- 本地存储
- 云存储切换

如果你后续要做头像、附件、富文本图片上传，优先复用现有上传模块。

## 15. 队列与任务能力

项目里接入了 `Bull`，并提供了任务模块，这意味着它可以支持：

- 异步任务执行
- 延迟任务
- 循环任务
- 推送型业务场景

如果你遇到耗时操作，不建议全堆在同步接口里，可以优先考虑接入任务模块。

## 16. 新人最常改哪些地方

最常见的后端改动通常集中在：

- 新增一个 CRUD 模块
- 修改 DTO 校验规则
- 修改菜单或权限逻辑
- 调整登录流程
- 调整上传配置
- 排查数据库或 Redis 配置问题

## 17. 开发建议

- DTO 一定要写清楚校验规则
- Service 里只放业务逻辑，不要把控制器逻辑揉进来
- 接口尽量保持统一返回结构
- 改权限相关代码时优先从守卫、角色、菜单三层联动思考
- 改登录流程时要同时考虑前端 token 刷新逻辑

继续阅读：[前端 admin 开发](/guide/admin)
