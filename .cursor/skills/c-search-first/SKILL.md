---
name: c-search-first
description: >-
  改代码前先搜本仓已有实现：utils、composables、同构页、plugins、@llcz/common。
  Use when 新工具函数、新封装、加依赖、可能已有同构页面，或提到造轮子、复用、search-first。
  Not for 已确认只改指定入口的纯接线。冲突以 monorepo-core / 各 app rule 为准。
---

# c-search-first

> **约束权威**：`monorepo-core.mdc`（禁重复造轮子）、`skill-rule-boundary.mdc`。  
> 入口：[../c-entry/SKILL.md](../c-entry/SKILL.md) · 蓝图：[../c-workflow/SKILL.md](../c-workflow/SKILL.md)

## Trigger

- 即将新建 util / composable / 抽象 / 依赖。  
- 用户说「做个 XX 能力」但仓库里可能已有同构页或 plugins。  
- **不用**：范围已钉死、只改指定列表字段/文案；不要用本 skill 拖延 `c-clarify`。

## 探测

按画像先 `rg`（只读），再决定 Adopt / Extend / Build：

| 先搜 | 例 |
|------|-----|
| 同构页面 | `views/system/user`、`pages/salary`、`modules/system/dept` |
| admin utils / composables | `apps/admin/src/utils`、`hooks`、`components` |
| server plugins | `apps/server/src/plugins`、`src/common` |
| 跨端 | `packages/common`、`@llcz/common` |
| 日期 | **day.js** / `dateUtil`，禁止新造 Date 工具 |

## 步骤

1. 用一句话定义需要的能力（输入/输出/端）。  
2. `rg` 本仓符号与文案；打开命中的样板文件确认是否真复用。  
3. 按分叉表决策；**Build 新文件/新依赖**须在蓝图「要改」里写理由，默认先问。  
4. 再进装配 skill 接线。

## 分叉表

| 信号 | 动作 |
|------|------|
| 同构页/现成函数可直接用 | **Adopt** — 按样板抄接线，不新建抽象 |
| 差一层参数或薄封装 | **Extend** — 加参数区分，或只改指定入口（共享件先 anchors 三选一） |
| 本仓没有、生态也非刚需 | **Build** — 最小代码；新依赖先 `c-clarify` |
| 多种搜法都没命中且通道不可用 | 如实写「未搜到 / 未跑 gh」，禁止谎称已调研 |

## FAIL / PASS

```text
FAIL: 新建 apps/admin/src/utils/formatMoney.ts（仓库已有金额 formatter / VXE 列 align）
PASS: rg format 金额相关 → 复用现有列 formatter 或 #/api 类型侧格式
```

```text
FAIL: 业务模块里再包一套 OCR SDK
PASS: 走 plugins OcrModule（nestjs-server.mdc）
```

## 完成检查

- [ ] 写过搜过的路径或「无命中」  
- [ ] 决策是 Adopt / Extend / Build 之一  
- [ ] Build 已出现在蓝图或已提问  

## 反模式 + 交接

- 跳过搜索直接新文件；把 npm 通用库当本仓真相。  
- 搜到了仍平行造第二套（第二套带 loading 的图片组件等）。  
- 下一步：`c-workflow` 蓝图 → 装配 skill；不要在本 skill 写业务实现。
