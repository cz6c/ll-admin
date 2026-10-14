---
name: c-review
description: >-
  只读审查本次 diff：是否越出蓝图、是否违反对应 app rule、权限/反馈/migration 红线。
  Use when 改完审查、对照蓝图、code review、范围检查。不改代码、不跑修复。
  Not for 实现、装配接线、通用 OWASP 百科。
---

# c-review

> **约束权威**：对应 app rule + `c-entry/anchors.md`（范围/纠错）。  
> 验证命令不在此执行 → [../c-verify/SKILL.md](../c-verify/SKILL.md)

**只读。** 不得为「审查顺手」改文件、补功能、跑 formatter 扫全仓。

## Trigger

实现结束后、用户要 review、交付前对账。  
**不用**：还没蓝图就审；用本 skill 代替 `c-clarify` 拍板。

## 探测

1. 读本次要改/不改清单（`c-workflow` 蓝图）；没有则先对照用户原话，标「无蓝图」。  
2. `git diff`（或用户指定的范围）；把 hunk 映射到画像与 rule。  
3. 打开对应 rule：**不**把 rule 全文贴进审查报告。

## 步骤（对账清单）

对每个 hunk 问：

1. **范围**：是否在蓝图「要改」或「修复断裂」内？范围外 → 记入报告，建议还原。  
2. **产品红线**：权限码是否发明/抄邻页；url 是否与 server 一致；migration 是否未经同意落盘；`$feedback` / `CcDialog` / uni `definePage`。  
3. **最小改动**：有无顺手重构、新抽象、兄弟页「顺便统一」。  
4. **共享件**：改了 `components/` / plugins / common 是否经过 anchors 三选一。  
5. **证据**：`c-verify` 是否已跑；没有则列「缺验证」，不要假装 CI 已过。

## 分叉表

| 结论 | 动作 |
|------|------|
| 无越界、红线未破 | 输出通过项 + 残留风险 |
| 有越界或红线 | **不改代码**；列出文件与建议（还原 / 补问 / 补验证） |
| 蓝图与 diff 对不上 | 先澄清需求是否变了 → `c-clarify`，不要自行扩 scope |

## 报告模板

```text
【c-review】
范围：与蓝图一致 / 越界如下
红线：权限 / url / migration / 反馈 / 路由
共享：未改共享 / 已改但未确认
验证：已跑 … / 缺 c-verify
结论：可交付 / 阻塞（列项）
```

## FAIL / PASS

```text
FAIL: 审查时顺手把相邻列表的列宽也「对齐」了
PASS: 只报告「兄弟页列宽不一致（范围外）」，保持 diff 不动
```

## 反模式 + 交接

- 通用安全/Next/Supabase 清单当本仓审查标准。  
- 把「建议」直接改掉。  
- 下一步：阻塞项回 `c-workflow`；验证走 `c-verify`。
