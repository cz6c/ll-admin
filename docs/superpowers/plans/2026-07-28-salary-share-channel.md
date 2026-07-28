# 渠道 from + 核对分享 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 本地归因 `from` + 核对详情微信转发，好友打开直达月薪核对页；未同意协议时门禁后回核对页。

**Architecture:** `utils/channelFrom.ts` 负责校验与 storage；`privacy.ts` 增加回跳 path 白名单；`App` / `verify` / `home` 捕获 `from`；`verify-detail` 注册 `onShareAppMessage`；同意协议后 `reLaunch` 回白名单 path。

**Tech Stack:** uni-app Vue3、微信小程序分享 API、`uni.setStorageSync`

## Global Constraints

- 分享标题不带金额；path 不含详情 id
- `from` 仅本地，不上报
- return path 白名单校验
- 注释遵循 `comment-standards.mdc`
- 包管理只用 pnpm；本包无单元测试框架时用 type-check / 手工对照 spec 验收

---

### Task 1: channelFrom 工具

**Files:**
- Create: `apps/uni/src/utils/channelFrom.ts`

**Interfaces:**
- Produces: `CHANNEL_FROM_KEY`, `DEFAULT_SHARE_FROM`, `normalizeChannelFrom`, `captureChannelFrom`, `getChannelFrom`, `buildFromQuery`, `captureChannelFromQuery`

- [ ] **Step 1: 实现 `channelFrom.ts`**

完整实现（含文件头 JSDoc）：

```typescript
/**
 * 拉新渠道参数 from
 * 职责：校验、本地读写、拼分享/落地 query
 * 适用：App 启动、salary 入口页、核对详情转发
 */

export const CHANNEL_FROM_KEY = 'salary_channel_from'
export const DEFAULT_SHARE_FROM = 'share'

const FROM_RE = /^[a-zA-Z0-9_-]{1,32}$/

export function normalizeChannelFrom(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  if (!FROM_RE.test(s))
    return null
  return s
}

export function captureChannelFrom(raw: unknown): void {
  const v = normalizeChannelFrom(raw)
  if (!v)
    return
  uni.setStorageSync(CHANNEL_FROM_KEY, v)
}

export function getChannelFrom(): string {
  const v = normalizeChannelFrom(uni.getStorageSync(CHANNEL_FROM_KEY))
  return v ?? ''
}

/** 优先已存渠道；否则用 fallback（分享默认 share） */
export function buildFromQuery(fallback: string = DEFAULT_SHARE_FROM): string {
  const from = getChannelFrom() || normalizeChannelFrom(fallback) || DEFAULT_SHARE_FROM
  return `from=${encodeURIComponent(from)}`
}

export function captureChannelFromQuery(query?: Record<string, unknown> | null): void {
  if (!query || query.from == null)
    return
  captureChannelFrom(query.from)
}
```

- [ ] **Step 2: 手工对照** — 非法串（含空格、`../`、33 字符）`normalize` 为 null；合法 `group_a` 通过

- [ ] **Step 3: Commit** — `feat(uni): add channelFrom util for acquisition attribution`

---

### Task 2: 隐私回跳 path

**Files:**
- Modify: `apps/uni/src/constants/privacy.ts`
- Modify: `apps/uni/src/components/PrivacyAgreementPopup.vue`
- Modify: `apps/uni/src/pages/legal/privacy-gate.vue`（onShow 已同意分支也走 resolve）

**Interfaces:**
- Produces: `PRIVACY_RETURN_PATH_KEY`, `setPrivacyReturnPath`, `consumePrivacyReturnUrl`（返回可 `reLaunch` 的完整 url）

- [ ] **Step 1: 在 `privacy.ts` 增加回跳 API**

白名单至少：`/pages/salary/verify`。`setPrivacyReturnPath(path)` 仅白名单写入。`consumePrivacyReturnUrl()`：读出后清除；若有合法 path，附带 `getChannelFrom()` 的 query；否则返回 `APP_HOME_PATH`。

- [ ] **Step 2: `agreePrivacy` 改为 `uni.reLaunch({ url: consumePrivacyReturnUrl() })`**

- [ ] **Step 3: `privacy-gate` onShow 已同意时同样 `reLaunch(consumePrivacyReturnUrl())`**

- [ ] **Step 4: Commit** — `feat(uni): privacy gate return path for verify deep link`

---

### Task 3: 入口捕获 from + verify 门禁

**Files:**
- Modify: `apps/uni/src/App.vue`
- Modify: `apps/uni/src/pages/salary/verify.vue`
- Modify: `apps/uni/src/pages/salary/home.vue`

- [ ] **Step 1: App onLaunch/onShow** 调用 `captureChannelFromQuery(options?.query)`

- [ ] **Step 2: verify onLoad** 先 `captureChannelFromQuery(options)`；增加 `onShow`：未同意则 `setPrivacyReturnPath('/pages/salary/verify')` + `redirectTo` 门禁

- [ ] **Step 3: home** 在隐私检查前，若能取到当前页 query 的 `from` 则 capture（`getCurrentPages` 末页 `options`，或 onLoad 存一份）；至少在 `onLoad` 捕获

- [ ] **Step 4: Commit** — `feat(uni): capture channel from on app and salary entry`

---

### Task 4: verify-detail 分享

**Files:**
- Modify: `apps/uni/src/pages/salary/verify-detail.vue`

- [ ] **Step 1: definePage 开启分享；`onShareAppMessage` 按 spec 返回 title/path；无静态图则不传 imageUrl**

- [ ] **Step 2: 结论卡加「分享给好友」button `open-type="share"`（`#ifdef MP-WEIXIN`），样式与「重新核对」协调

- [ ] **Step 3: Commit** — `feat(uni): wechat share card on payslip verify detail`

---

### Task 5: 验收

- [ ] **Step 1:** `pnpm --filter @apps/uni type-check`（或项目等价命令）通过
- [ ] **Step 2:** 对照 spec 测试要点 1–6 自检清单勾选
- [ ] **Step 3:** 若有未提交改动则整理提交
