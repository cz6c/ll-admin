# 部署指南

本章补充 `apps/admin` 与 `apps/server` 的部署说明，目标是帮助你把这套项目从本地开发环境发布到服务器，并形成一个可长期维护的部署流程。

## 1. 部署目标

项目上线后通常会形成以下结构：

- `admin`：构建为静态资源，交给 `Nginx` 托管
- `server`：构建为 Node 服务，交给 `PM2` 守护运行
- `MySQL`：独立数据库服务
- `Redis`：独立缓存服务

## 2. 服务器准备

建议至少准备以下基础环境：

- Linux 服务器一台
- `Node.js >= 18`
- `pnpm >= 9`
- `Nginx`
- `PM2`
- `MySQL`
- `Redis`

如果你是第一次部署，建议先手工部署一遍，跑通后再接入自动化流程。

## 3. 推荐目录结构

可以参考下面的目录组织方式：

```text
/www/wwwroot/
├─ ll_admin/          admin 构建后的静态文件
└─ ll_api/
   ├─ server/         server 项目代码
   └─ prod.yml        生产环境配置文件
```

这和仓库当前 GitHub Actions 中的部署路径基本一致。

## 4. 部署 admin

`admin` 本质上是一个 Vite 前端项目，部署思路是“本地或 CI 构建 -> 上传 dist -> Nginx 托管”。

### 4.1 本地构建

进入目录：

```bash
cd apps/admin
pnpm install
pnpm run bs:build
```

说明：

- `bs:build` 对应浏览器版生产构建
- 构建产物通常在 `apps/admin/dist`

### 4.2 上传构建产物

将 `dist` 目录上传到服务器，例如：

```text
/www/wwwroot/ll_admin
```

### 4.3 配置 Nginx

一个最基础的静态托管配置可以参考：

```nginx
server {
    listen 80;
    server_name your-admin-domain.com;

    root /www/wwwroot/ll_admin;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

如果前端使用的是 history 路由模式，`try_files ... /index.html;` 非常关键，否则刷新页面会直接 `404`。

### 4.4 admin 部署后的检查项

- 页面是否能正常打开
- 登录页是否能访问
- 刷新任意动态路由页面是否正常
- 静态资源是否全部加载成功
- 接口请求是否打到了正确的后端地址

## 5. 部署 server

`server` 是一个 NestJS 服务，部署思路是“上传代码 -> 安装依赖 -> 构建 dist -> PM2 启动”。

### 5.1 上传代码

将 `apps/server` 上传到服务器，例如：

```text
/www/wwwroot/ll_api/server
```

### 5.2 准备生产配置

仓库当前的工作流会把：

```text
/www/wwwroot/ll_api/prod.yml
```

复制到：

```text
/www/wwwroot/ll_api/server/src/config/prod.yml
```

因此建议你把生产配置单独放在服务器，不要直接写进仓库。

生产配置里至少要包含：

- 服务端口
- MySQL 连接信息
- Redis 连接信息
- JWT 密钥
- 上传目录
- 邮件配置
- COS 或第三方服务配置

### 5.3 安装依赖并构建

进入服务目录执行：

```bash
cd /www/wwwroot/ll_api/server
pnpm install
pnpm run build
```

构建后会生成：

```text
dist/main.js
```

## 6. 使用 PM2 启动 server

项目已经自带了 PM2 配置文件：

- `apps/server/ecosystem.config.js`

### 6.1 手工启动

在服务器执行：

```bash
cd /www/wwwroot/ll_api/server
pm2 start ecosystem.config.js --env production
pm2 save
```

### 6.2 查看运行状态

```bash
pm2 list
pm2 logs ll_api
```

### 6.3 重启服务

```bash
pm2 restart ll_api
```

### 6.4 停止服务

```bash
pm2 stop ll_api
```

## 7. Nginx 反向代理 server

通常不会直接暴露 Node 服务端口，而是让 `Nginx` 反向代理到 Nest 服务。

示例：

```nginx
server {
    listen 80;
    server_name your-api-domain.com;

    location / {
        proxy_pass http://127.0.0.1:6060;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

如果你给后端配置了统一前缀，比如 `/api`，则代理规则也要同步调整。

## 8. 数据库与 Redis 的生产建议

上线时建议注意下面几点：

- 不要沿用开发环境账号密码
- 不要把生产凭证写进仓库
- MySQL 开启定期备份
- Redis 建议设置访问权限
- 生产环境关闭不必要的调试输出

## 9. GitHub Actions 当前部署方式

仓库已经存在两条工作流：

- 前端部署：[web.yml](file:///e:/cz6/ll-admin/.github/workflows/web.yml)
- 后端部署：[server.yml](file:///e:/cz6/ll-admin/.github/workflows/server.yml)

### 9.1 admin 工作流

当前流程大致是：

1. 监听 `web` 分支 push
2. 安装 `pnpm` 和 `Node`
3. 进入 `apps/admin`
4. 执行构建
5. 将 `dist` 上传到服务器目录 `/www/wwwroot/ll_admin`

### 9.2 server 工作流

当前流程大致是：

1. 监听 `server` 分支 push
2. 将 `apps/server` 上传到服务器目录 `/www/wwwroot/ll_api/server`
3. 在服务器复制 `prod.yml`
4. 安装依赖
5. 构建后端
6. 通过 `PM2` 重启 `ll_api`

## 10. 建议的上线顺序

推荐按下面顺序上线：

1. 准备生产数据库和 Redis
2. 上传并校验 `server` 生产配置
3. 构建并启动 `server`
4. 用 Swagger 或 Postman 检查后端接口
5. 构建并发布 `admin`
6. 验证登录、菜单、核心业务页面

## 11. 上线前检查清单

上线前建议逐项确认：

- `server` 生产配置是否完整
- 数据库是否已初始化
- Redis 是否可连接
- `PM2` 是否正常运行
- `Nginx` 配置是否正确
- 前端接口地址是否指向生产后端
- 登录、菜单、用户管理、角色管理是否可用
- 上传能力是否正常
- 日志目录是否可写

## 12. 部署后的常见问题

### 12.1 admin 打开空白页

优先检查：

- `Nginx root` 是否正确
- 静态资源路径是否正确
- 前端构建后的环境变量是否正确

### 12.2 刷新页面 404

优先检查：

- `Nginx` 是否配置了 `try_files $uri $uri/ /index.html;`

### 12.3 server 能启动但接口请求失败

优先检查：

- `prod.yml` 是否存在
- 数据库和 Redis 是否可连接
- `NODE_ENV` 是否为 `production`

### 12.4 PM2 启动后反复重启

优先检查：

- `dist/main.js` 是否存在
- 构建是否成功
- 配置文件是否缺失
- 日志文件里是否有启动异常

### 12.5 上传功能线上不可用

优先检查：

- 上传目录权限
- 域名配置
- 本地存储与云存储配置是否正确

## 13. 进一步优化建议

如果你准备长期维护这套项目，建议继续补齐：

- `.env.example` 或 `prod.yml.example`
- 自动化数据库备份
- 发布回滚策略
- CI/CD 的构建产物缓存
- 部署后自动健康检查

读完本章后，你已经具备了把 `admin + server` 从本地开发环境发布到服务器的基础能力。
