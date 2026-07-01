# @apps/uni

薪算工具箱 — uni-app 多端应用（H5 / 微信小程序 / App）。

## 开发

在 monorepo 根目录执行：

```bash
pnpm dev:uni       # H5
pnpm dev:uni:mp    # 微信小程序
```

或在当前包内：

```bash
pnpm dev:h5
pnpm dev:mp-weixin
```

## 构建

```bash
pnpm build:uni:h5
pnpm build:uni:mp
```

## 环境变量

配置位于 `env/` 目录（`.env`、`.env.development`、`.env.production` 等）。

## 说明

- `src/manifest.json`、`src/pages.json` 由 `scripts/create-base-files.js` 在 `prepare` / `predev` 时自动生成。
- 当前 API 指向 `laf.run`，见 `env/.env` 中 `VITE_SERVER_BASEURL`。
