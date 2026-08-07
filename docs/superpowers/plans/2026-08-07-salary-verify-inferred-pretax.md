# 月薪核对反推申报应发 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 个税差异时反推申报应发并提示少报/多报；用户确认后把反推写入后端，后续累计 prior 使用申报应发。

**Architecture:** 引擎扩展 `effectivePreTaxForCumulative` + `inferPreTaxFromTax`；核对结果带内存反推字段；确认后 upsert `inferredPreTax` / `reportBias` / `useInferredForCumulative`；prior 快照只读有效应发。

**Tech Stack:** uni-app Vue3 TS、NestJS TypeORM、现有 `salaryCalculator` / `payslipVerify`。

**Spec:** `docs/superpowers/specs/2026-08-07-salary-verify-inferred-pretax-design.md`

## Global Constraints

- 不覆盖工资条 `preTaxMonthly`
- 反推仅用户确认后落库
- 缺月 / ideal 不反推
- 少报不催财务；日期用 day.js（本功能几乎不新增日期逻辑）

---

## File map

| File | Role |
|------|------|
| `apps/uni/src/utils/salaryCalculator.ts` | `inferPreTaxFromTax` + result 字段 |
| `apps/uni/src/utils/payslipVerify.ts` | `effectivePreTaxForCumulative`、snapshot 走有效应发 |
| `apps/uni/src/utils/*.spec.ts` 或现有 test 位置 | 反推单测 |
| `apps/server/.../salary-verify-history.entity.ts` + DTO + service | 三字段持久化 |
| `apps/uni/src/api/salary-verify*` + `store/salaryHistory.ts` | 类型与映射 |
| `apps/uni/src/pages/salary/verify-detail.vue` | 文案 + 确认/改回 |
| 列表摘要相关 util/组件 | 申报偏低等文案 |

## Tasks

### Task 1: 引擎反推 + 有效应发

- [ ] 扩展 `PayslipVerifyRecord` 可选三字段
- [ ] `effectivePreTaxForCumulative` + `recordToSnapshot` 使用之
- [ ] `inferPreTaxFromTax` 二分求解
- [ ] `verifyPayslipTax*` 在 tax 不匹配且非 ideal 时填充反推字段
- [ ] 单测：少报反推误差 ≤ 0.01、`reportBias=under`

### Task 2: Server 持久化

- [ ] entity 三列 + enum（或 varchar）
- [ ] create/update/list DTO 与 service map
- [ ] 确认：仅 verify upsert 读写；calc 忽略

### Task 3: Uni API/Store

- [ ] API 类型与 upsert body
- [ ] `toHistoryRecord` / `toVerifyRecord` / upsert 映射
- [ ] 普通保存不带反推；确认接口带三字段

### Task 4: verify-detail UX

- [ ] 少报/多报文案与确认、改回按钮
- [ ] 改 `verdictSummary` 少报不催财务
- [ ] 确认 upsert 后刷新本地 record

### Task 5: 列表摘要

- [ ] 历史行/年进度：申报偏低/已按申报口径/申报偏高

---
