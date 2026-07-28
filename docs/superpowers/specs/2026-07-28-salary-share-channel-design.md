# 薪算拉新：渠道参数 `from` + 核对结果页微信分享

**日期：** 2026-07-28  
**状态：** 已确认  
**范围：** `@apps/uni` 主包 salary（渠道归因 + 月薪核对详情转发）

## 目标

支撑拉新冷启动：运营物料与好友转发可带 `from` 归因；核对详情可通过微信原生转发卡片拉新用户直达月薪核对页，并在 3 分钟内完成首次核对。

## 已确认决策

| 项 | 决定 |
|----|------|
| 分享形态 | A：微信 `onShareAppMessage`（标题 + path；可选静态 imageUrl） |
| 分享标题 | A：只写结论，不带金额（一致 / 存在差异） |
| 被打开落地 | A：直达 `/pages/salary/verify?from=...` |
| 归因存储 | A：本地 storage，本轮不上报服务端 |
| 实现路径 | 方案 1：独立 `channelFrom` 工具 + 入口捕获 + verify-detail 分享 |

## 非目标（本轮不做）

- 海报 canvas / 保存相册
- 分享标题或卡片展示差额金额、税前/税后原数
- 服务端埋点 / 分析 SDK
- 年薪测算详情页分享
- 动态生成分享封面图（可用静态资源；无则省略 imageUrl）

## 架构

```
运营码 / 分享冷启动
  → App.onLaunch|onShow query.from
  → captureChannelFrom() → uni.setStorageSync

任意页 onLoad 带 ?from=
  → captureChannelFrom()

verify-detail 转发
  → onShareAppMessage
      title: 结论文案（无金额）
      path: /pages/salary/verify?from=<已存渠道 | share>

好友打开
  → verify 页
  → 未同意协议 → privacy-gate（同意后回 verify）
  → 已同意 → 直接核对流程
```

## 模块设计

### 1. `channelFrom` 工具（新建）

**路径建议：** `apps/uni/src/utils/channelFrom.ts`

| 导出 | 职责 |
|------|------|
| `CHANNEL_FROM_KEY` | storage key，如 `salary_channel_from` |
| `DEFAULT_SHARE_FROM` | 无既有渠道时分享默认值：`share` |
| `normalizeChannelFrom(raw)` | 校验：非空、长度 ≤ 32、仅 `[a-zA-Z0-9_-]`；非法返回 `null` |
| `captureChannelFrom(raw)` | 合法则写入 storage；非法忽略 |
| `getChannelFrom()` | 读 storage，无则 `''` |
| `buildFromQuery(fallback?)` | 拼 `from=xxx`；优先已存渠道，否则 `fallback`（分享场景用 `share`） |
| `captureChannelFromQuery(query)` | 从 `Record` / 启动 query 取 `from` 并 capture |

**不写** 业务页面里的零散 `setStorageSync('from', ...)`。

### 2. 捕获入口

| 位置 | 行为 |
|------|------|
| `App.vue` `onLaunch` / `onShow` | 从 `options.query` 调用 `captureChannelFromQuery`（覆盖扫码、分享冷/热启动） |
| `pages/salary/verify.vue` `onLoad` | 捕获 `options.from`（与 reentry 解析并存，互不覆盖业务字段） |
| `pages/salary/home.vue` | `onShow` 或等价入口若 URL 带 `from` 则捕获（H5/深链） |

### 3. `verify-detail` 分享

- `definePage`：微信侧开启分享（按 uni-app / 项目惯例配置 `enableShareAppMessage` 或等价字段）。
- `onShareAppMessage` 返回：
  - **title**
    - `overallMatch === true` → `我刚核对了工资条：核对一致`
    - 否则 → `我刚核对了工资条：存在差异`
    - 记录未加载完成时 → `发薪了？30 秒核对工资条扣款对不对`（兜底，避免空标题）
  - **path**：`/pages/salary/verify?${buildFromQuery(DEFAULT_SHARE_FROM)}`（不要把详情 `id` 带给接收方）
  - **imageUrl**：若存在 `static/share-verify.png`（或约定路径）则带上；否则省略，走客户端默认
- UI（建议本轮带上）：结论卡区域增加「分享给好友」——微信小程序用 `<button open-type="share">` 样式收敛为文字链/次要按钮，与菜单转发共用同一套 `onShareAppMessage`。

### 4. 隐私门禁与拉新落地

**问题：** 当前仅 `home` 检查协议；分享直达 `verify` 会绕过门禁。

**本轮行为：**

1. `verify` 在 `onShow`（或 `onLoad` 后）若 `!hasPrivacyAgreed()`：先 `captureChannelFrom`（若有），再将「同意后回跳」写入 storage（如 `privacy_return_path = /pages/salary/verify`），然后 `redirectTo` 门禁页。
2. `privacy-gate` / `PrivacyAgreementPopup` 同意后：若存在合法 `privacy_return_path`（仅允许本应用内 path，白名单至少含 `/pages/salary/verify`），则 `reLaunch` 该 path（可附带当前 `from` query）；否则保持现逻辑 `reLaunch` 首页。
3. 回跳后清除 `privacy_return_path`，避免残留。

**安全：** return path 必须白名单校验，禁止任意 URL。

## 数据流与边界

- `from` **不**进入薪资历史 API、不入库；仅本地归因。
- 分享 path **不**包含核对记录 id、金额、工资条字段。
- 已有渠道时二次分享 **沿用** 原 `from`（社群码 → 用户 → 再分享仍算该社群）；无渠道时用 `share`。

## 错误与降级

| 情况 | 处理 |
|------|------|
| `from` 非法 | 忽略，不覆盖已有 storage |
| 详情未加载完就点分享 | 使用兜底 title + 仍落到 verify |
| 无静态封面图 | 不传 `imageUrl` |
| return path 非法 | 回首页 |

## 测试要点

1. `verify?from=group_a` 进入后 storage 为 `group_a`；再分享 path 含 `from=group_a`。
2. 无渠道时分享 path 含 `from=share`。
3. 标题：一致 / 差异两种；无金额数字。
4. 好友打开落到核对页（非详情、非首页）。
5. 未同意协议：门禁 → 同意 → 回到核对页；`from` 仍在。
6. 非法 `from`（超长、特殊字符）不写入。

## 成功标准

1. 运营可用不同 `from` 的核对页码区分渠道（本地可读）。
2. 核对详情可转发；接收方一键进入核对流程。
3. 分享文案无薪资金额；隐私门禁不阻断拉新落地。
