# 月薪核对：个税差异反推申报应发 + 用户确认后沿用累计

**日期：** 2026-08-07  
**状态：** 已确认  
**范围：** `@apps/uni` 月薪核对（引擎 / 详情与列表文案 / 确认交互）+ `@apps/server` 核对历史持久化字段

## 目标

公司报税应发与工资条应发不一致时（常见为少报）：

1. 在个税有差异时**反推申报口径应发**，明确告知用户少报或多报；
2. **默认不改变**后续累计预扣口径；仅当用户确认「按申报口径继续核对」后，后续月份 prior 链改用反推应发；
3. 少报场景用中性话术（不催财务更正），多报可提示核对。

避免：少报后每月按「真实应发」重算导致差异月月误报为新问题，同时避免未确认就静默改口径。

## 已确认决策

| 项 | 决定 |
|----|------|
| 产品组合 | A（少扣降级话术）+ B（申报口径对齐） |
| 申报有效应发来源 | 个税差异时数值反推；不覆盖工资条 `preTaxMonthly` |
| 后续累计是否沿用反推 | **须用户显式确认**；默认 `useInferredForCumulative = false` |
| 反推结果何时落库 | **确认框点确认后**写入；输入框默认系统反推值，用户可改准再存 |
| 确认文案入口 | 「按申报继续」→ 二次确认框（可改申报应发）→ 落库；可改回「按工资条应发累计」 |
| 缺月 / `ideal` 推算 | **不**自动反推，不提供确认沿用 |
| 反推失败 | 不展示确认按钮；提示可能为专项扣除等其他原因 |

## 非目标（本轮不做）

- 自动联系/催促财务更正申报
- 双轨同时展示完整两套累计明细表（本轮：主结论 + 反推说明即可；确认前后切换主累计口径）
- 从个税 App 截图 OCR 申报收入
- 年薪测算（calc）接入反推逻辑
- 为反推单独做新页面（落在现有 verify-detail / 列表摘要）

## 问题背景

累计预扣：

```text
本期应扣 = 累计应预扣税额(累计收入等) − 累计已预扣税额
```

若某月税务申报应发偏低，而工资条仍填真实应发：按条重算的应然个税会高于条上实扣；若不修正累计底座，后续月即使用真实应发也会持续偏差。少报时员工通常不要求财务更正，产品应解释并可选用申报路径继续核对。

## 架构

```
核对输入（工资条字段 + 同年 prior 记录）
  → 有效应发链：useInferred ? inferredPreTax : preTaxMonthly
  → 应然个税（工资条应发算本月）
  → taxMatch?
       是 → 核对一致
       否 → 反推 inferredPreTax（固定 prior 有效链 + 本月扣除项 + 目标个税）
            → 展示少报/多报 + 差额（内存，不落库）
            → 用户确认？
                 是 → upsert 后端：inferredPreTax + reportBias + useInferred=true
                      后续月 prior 从接口读到后使用 inferredPreTax
                 否 → 仅展示，后端无反推字段，累计仍用工资条应发
```

## 模块设计

### 1. 有效应发解析（新建小工具或并入 `payslipVerify` / `salaryCalculator`）

```ts
/** 参与累计预扣的月度应发：确认沿用反推时用 inferred，否则用工资条 */
function effectivePreTaxForCumulative(record: PayslipVerifyRecord): number
```

规则：

- `useInferredForCumulative === true` 且 `inferredPreTax` 为有效有限数字 → 用 `inferredPreTax`
- 否则 → `preTaxMonthly`
- `recordToSnapshot` / prior 组装必须走该函数，禁止直接读 `preTaxMonthly` 进累计链

本月「应然个税」比对仍用**本月工资条** `preTaxMonthly`（未确认前发现偏差）；确认后该月在下游 prior 中改用反推值。

### 2. 反推引擎（`salaryCalculator`）

新增例如：

```ts
/**
 * 在固定 prior 快照与本月扣除项下，求使本期应扣 ≈ targetTax 的本月税前应发
 * @returns 成功：{ inferredPreTax, reportBias }；失败：null
 */
function inferPreTaxFromTax(params: {
  priorMonths: PayslipMonthSnapshot[] // 已按有效应发组装
  current: Omit<PayslipMonthSnapshot, 'preTaxMonthly'> & { /* 扣除项 */ }
  targetTax: number
  slipPreTax: number // 仅用于判定 under/over
}): { inferredPreTax: number, reportBias: 'under' | 'over' } | null
```

实现约定：

- 对 `preTaxMonthly ≥ 0` 做数值求解（二分）；若税率平台导致多个应发对应同一税额，取与 `slipPreTax` 绝对值最接近的解（再 `round2`）
- 容差与现有核对一致：`VERIFY_TOLERANCE = 0.01`
- `inferredPreTax` 四舍五入到分（`round2`）
- `reportBias`：`inferredPreTax < slipPreTax - tol` → `under`（少报）；`>` → `over`（多报）；几乎相等则不应进入反推成功路径
- 无解、目标税额与任意应发均无法对齐、或 `calcMode === 'ideal'` / 存在 `missingPriorMonths` → 返回 `null`

### 3. 核对结果扩展

在 `PayslipVerifyResult`（及 breakdown 包装）上增加只读推导字段（可不入库，由当次计算得出）：

| 字段 | 含义 |
|------|------|
| `inferredPreTax` | 反推应发；失败为 `null` |
| `reportBias` | `under` \| `over` \| `null` |
| `inferredDelta` | `slipPreTax - inferredPreTax`（正数表示条上应发更高，即少报额度） |

持久化见下节。确认前：`PayslipVerifyResult` 可带反推字段供 UI 展示，**不得**因「算出了反推」就写库。

### 4. 持久化（uni store 映射 + server 实体/DTO）

**为何同意后再存后端：** 后续月份拉 `relatedVerifyList` / 历史列表做累计预扣时，需要跨端、跨会话读到「该月是否沿用申报应发」。只放本地 store 会丢、也无法多端一致；同意前就入库则会在用户未认可时污染后续个税计算。

在 **verify** 历史行增加：

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `inferredPreTax` | decimal / number \| null | null | 用户确认后写入的反推应发；未确认保持 null |
| `reportBias` | enum `under` \| `over` \| null | null | 与确认时反推一致；未确认保持 null |
| `useInferredForCumulative` | boolean | false | 用户是否确认沿用 |

- **不**改写 `preTaxMonthly`
- calc 类型行忽略这些字段
- 迁移：新列可空 / 默认 false；老数据行为与现网一致
- API：`SalaryVerifyHistory` 读写 DTO、entity、`toHistoryRecord` / upsert body 同步

确认操作：详情页在用户点击「按申报口径继续核对」时，用当次内存反推结果调用既有 upsert，**一次性**写入上述三字段（`useInferredForCumulative=true`）。未点确认：upsert 工资条主字段时不要带反推三字段（或显式保持 null/false）。

改回工资条累计：`useInferredForCumulative = false`（可保留 `inferredPreTax` 便于再次确认，或一并清空——**本轮约定保留反推值，仅关开关**）。

用户修改该月 `preTaxMonthly` / 个税 / 扣除项并重新保存：应**重新跑核对**；若税额已一致则清 `inferredPreTax`、`reportBias`、`useInferredForCumulative`；若仍不一致则重新反推并写入新的 `inferredPreTax`/`reportBias`，且 **重置** `useInferredForCumulative = false`（需再次确认）。

### 5. UI / 文案

**verify-detail（主）：**

- 个税不一致且反推成功：
  - 少报：`公司申报应发约 ¥X（比工资条低 ¥Y）。按申报少扣，你可能多到手；若不纠正，后续月差异可能持续。`
  - 多报：`公司申报应发约 ¥X（比工资条高 ¥Y）。可能多扣个税，建议核对工资条与申报。`
  - 主按钮（次要视觉即可）：`按申报口径继续核对` → 写库 `useInferredForCumulative=true`
  - 已确认态：展示「后续累计已按申报应发 ¥X」+ 操作 `改回按工资条应发累计`
- 个税不一致且反推失败：维持差异结论 + `未能从个税反推应发，可能是专项附加扣除等不一致，请核对扣除项`
- 少报**不**再使用「请检查个税申报 / 催财务」类强催促文案（与现 `verdictSummary` 对齐修改）

**列表 / 年进度摘要：**

- 少报未确认：中性如「申报偏低」
- 少报已确认：如「已按申报口径」
- 多报：偏警示如「申报偏高」

**分享标题：** 保持不带金额；可不区分少报多报（仍用一致/存在差异），避免分享泄露口径细节。

### 6. 数据流要点

| 场景 | prior 某月快照应发 | 本月算应然用的应发 |
|------|-------------------|-------------------|
| 默认 | 工资条 | 工资条 |
| 历史月已确认沿用 | 该月 `inferredPreTax` | 工资条（本月比对） |
| 本月已确认沿用 | （作为更后月的 prior 时用反推） | 详情展示可同时标申报口径；列表下游生效 |

同一自然年内按 payPeriod 升序；乱序禁止。

## 错误与降级

| 情况 | 处理 |
|------|------|
| 缺月 / ideal | 不反推、不提供沿用确认；保留现有 ideal 提示 |
| 反推无解 | 差异展示 + 扣除项提示；无确认按钮 |
| 浮点/分位抖动 | 容差 0.01；入库 round2 |
| 仅税后自洽差、个税一致 | 不走反推（反推仅针对个税 vs 应然累计） |
| 服务端无新字段（过渡） | uni 以可选字段读取；缺省 false/null，行为同现网 |

## 测试要点

1. 单月少报：应然税 > 条上税 → 反推应发 < 条上应发 → `under`；未确认时下月仍差；确认后下月按申报路径应对齐（在公司后续申报与反推链一致的前提下）。
2. 多报对称：`over` + 偏警示文案；确认同样显式。
3. 确认后改回：下游恢复按工资条应发累计。
4. 修改个税使一致后：清除沿用开关，不再展示少报确认条。
5. 缺月记录：无反推按钮。
6. 老数据无新字段：与改前核对结果一致。
7. 单元测试：`inferPreTaxFromTax` 在已知 fixture 下反推误差 ≤ 0.01，且 `reportBias` 正确。

## 成功标准

1. 用户能理解差异来自申报少报/多报（有反推应发与差额）。
2. 未点确认时，后续累计行为与现网一致（仍按工资条应发）。
3. 确认后，后续月 prior 使用反推应发，少报场景不再无解释地月月「新异常」。
4. 少报文案不催财务；多报可提示自查。

## 实现顺序建议

1. 引擎：`effectivePreTax` + `inferPreTaxFromTax` + 结果字段 + 单测  
2. Server：entity / DTO / upsert 映射  
3. Uni：store/API 类型与 upsert  
4. verify-detail 文案与确认/改回  
5. 列表摘要文案  
