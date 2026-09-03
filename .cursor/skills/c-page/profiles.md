# tsb monorepo 画像

> 本仓页面/功能 skill 识别 app 画像的单一事实源。探测完成前不得硬编码某一端路径。

## 画像探测

1. 用户给出的路径/路由：`apps/admin/**` → admin；`apps/server/**` → server；`apps/uni/**` → uni；`apps/admin/src-tauri/**` → admin-cs（Tauri）。
2. 能力形态：HTTP CRUD → admin-bs + server；本机 `invoke` / 独立壳 → admin-cs；移动端页面 → uni。
3. 证据冲突或未知时先问（走 `c-clarify`），不得猜。

## 画像表

| 项 | `admin-bs` | `admin-cs` | `server` | `uni` |
|----|------------|------------|----------|-------|
| 根 | `apps/admin/src/views/**` | 同上 + `apps/admin/src-tauri/**` | `apps/server/src/modules/**` | `apps/uni/src/pages/**`、`pages-sub/**` |
| 标准列表 | `views/system/user/` | CS 工具页：`views/album/` | CRUD 样板：`modules/system/dept/` | 表单样板：`pages/salary/calc.vue` |
| 弹窗/表单 | 列表内 `components/Edit*Form.vue` + `a-modal` | 同目录 `*Modal.vue` | DTO + Controller | `wd-form` + schema |
| API | `src/api/**` + `#/api/**`（`$http`） | `src/api/*.ts`（`invoke`） | controller 路径 | `src/api/**` + `src/http/**` |
| 路由 | 动态菜单 `sys_menu` + `permission.ts`；本地 `router/local.ts` | 免登常量路由 `router/album.ts` + `csPublic.ts` | Nest `@Controller` | `definePage`（勿手改 `pages.json`） |
| 权限 | `v-auth` / `hasPermission` / `meta.perms` | CS 公路径常免登录；按钮级仍按页面约定 | Jwt + 装饰器 | 以页面业务为准 |
| 校验门禁 | `vue-admin.mdc` + `antd-design-system.mdc` | 另加 `rust-tauri.mdc`（`cargo check` 0 warning） | `nestjs-server.mdc`（migration 须用户同意） | `vue-uni.mdc` |
| i18n | **无** vue-i18n；antd `zhCN` | 同左 | 接口文案/错误码映射 | 按页面文案，勿套 ERP locales |

## 路径令牌

| 令牌 | 含义 |
|------|------|
| `<profile>` | `admin-bs` / `admin-cs` / `server` / `uni` |
| `<admin-view>` | `apps/admin/src/views/<domain>/<page>/` |
| `<admin-api>` | `apps/admin/src/api/<domain>/` |
| `<server-module>` | `apps/server/src/modules/<domain>/` |
| `<tauri-mod>` | `apps/admin/src-tauri/src/<mod>/` |
| `<uni-page>` | `apps/uni/src/pages/...` 或 `pages-sub/...` |
| `<uni-api>` | `apps/uni/src/api/` |

## 硬规则

- 同一任务只使用已确认画像；跨端全链路须在蓝图中分端列文件。
- **约束全文**在 app rules（见上表「校验门禁」）；本表只作画像探测，不复制 rule 条文。
- 新增 rule/skill 遵循 `.cursor/rules/skill-rule-boundary.mdc`。