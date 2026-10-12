## 原则 10 · 即时反应

交互前有邀请、中有过渡、**后必须有反馈**；输入量级越大反馈越重。

### 反馈 API（强制）

统一入口：`import $feedback from "@/utils/feedback"`（实现见 `src/utils/feedback.ts`）。

| 场景 | 必须用 | 禁止 |
|------|--------|------|
| 一次消费的成功/失败/警告/提示 | `$feedback.message.success/error/warning/info` | 直调 `message`（antd）、用 `a-alert` / 页面 `errorMsg` ref 粘住结果 |
| 需用户确认的危险/不可轻易撤销操作 | `$feedback.confirm(content, options?)` | 直调 `Modal.confirm` |
| 带输入的确认（如重置密码） | `$feedback.confirmInput` | 页内自拼 Modal + Input |
| 全屏长时间等待 | `$feedback.loading` / `closeLoading` | 另起一套全局 loading 皮肤 |

`$feedback.confirm` 可选：`title` / `okText` / `cancelText` / `okType` / `cooldownMs`（如删云 1.5s 冷却）；缺省与历史「系统提示 + 危险确定」一致。确定 resolve、取消 reject。

```ts
// ✅
await $feedback.confirm("将丢弃进度", { title: "取消任务？", okText: "取消任务" });
$feedback.message.error(formatIcloudSyncError(e));

// ❌
import { message, Modal } from "ant-design-vue";
message.error(e);
Modal.confirm({ title, content, onOk });
```

### 何时仍可用 `a-alert`（非常驻操作结果）

仅当文案是**当前步骤的上下文说明**、需对照界面阅读时：

- 登录前 checklist、切换账号警示、2FA 说明
- 列表/表单旁的风险提示（如「部分组存在多落库」）
- 媒体区内就地失败态（播放器内嵌）

**禁止**用 `a-alert` 展示一次操作的成败（登录结果、同步失败 toast、扫描/删除失败等）——这类走 `$feedback.message`；任务态标题+主按钮（如「刷新失败」+「重新开始」）留在状态条，不要整块换成 alert 盖住操作。

### 其它即时反应

- **查询**：自动完成、实时搜索按类目是否确定选用对应下拉；避免无反馈的静默失败。
- **录入**：提交前实时校验/强度预览优于提交后才报错；提示渐进展现，勿一次堆满。
- **进度**：按钮 loading、表格/列表 loading、整页 loading 按操作量级选用（`v-loading` / `a-spin`）。
- **刷新**：有新内容可「点击刷新」或定时刷新 + 新行短暂高亮。

---
