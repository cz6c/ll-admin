/**
 * 月薪核对：历史记录 → 累计预扣核对结果的适配层
 * 职责：从 store 记录拼 priorMonths / missingPriorMonths，再调 salaryCalculator 核对；
 *       计入累计收入统一经 effectivePreTaxForCumulative；工资条字段仍用于个税/税后比对
 * 适用：历史列表摘要、核对详情页明细、本年对照台账
 */
import type { PayslipVerifyRecord } from '@/store/salaryHistory'
import type {
  PayslipMonthSnapshot,
  PayslipVerifyBreakdownResult,
  PayslipVerifyInput,
  PayslipVerifyResult,
} from '@/utils/salaryCalculator'
import { formatSalaryAmount } from '@/utils/formatSalaryAmount'
import { listMissingPriorMonths, parsePayPeriod } from '@/utils/payPeriod'
import { verifyPayslipTax, verifyPayslipTaxBreakdown } from '@/utils/salaryCalculator'

/**
 * 计入累计预扣的本月收入（与个税 App「本期收入」对照）
 * 1. 已确认修正（报税收入）→ 用修正金额，不再扣其他扣款
 * 2. 默认 → 工资条应发 − 其他扣款
 * @note 不得覆盖展示用 preTaxMonthly；计税链（当月 + prior）与台账主列均走此口径
 */
export function effectivePreTaxForCumulative(
  record: Pick<
    PayslipVerifyRecord,
    'preTaxMonthly' | 'inferredPreTax' | 'useInferredForCumulative' | 'otherDeductionAmount'
  >,
): number {
  if (
    record.useInferredForCumulative
    && record.inferredPreTax != null
    && Number.isFinite(record.inferredPreTax)
  ) {
    return Math.max(0, record.inferredPreTax)
  }
  const other = Math.max(0, record.otherDeductionAmount || 0)
  return Math.max(0, record.preTaxMonthly - other)
}

/**
 * 历史记录 → 累计预扣月份快照
 * @note preTaxMonthly 已是计入累计净额，otherDeductionAmount 固定 0，避免引擎再减一次
 */
export function recordToSnapshot(r: Pick<
  PayslipVerifyRecord,
  'preTaxMonthly' | 'ssPersonalAmount' | 'hfPersonalAmount' | 'otherDeductionAmount' | 'specialDeductionMonthly' | 'inferredPreTax' | 'useInferredForCumulative'
>): PayslipMonthSnapshot {
  return {
    preTaxMonthly: effectivePreTaxForCumulative(r),
    ssPersonalAmount: r.ssPersonalAmount,
    hfPersonalAmount: r.hfPersonalAmount,
    otherDeductionAmount: 0,
    specialDeductionMonthly: r.specialDeductionMonthly,
  }
}

/**
 * 取同年且早于目标月的历史，按月份升序
 * 累计预扣必须按 1..M-1 顺序累加，乱序会导致本期税额错误
 */
function getPriorRecords(payPeriod: string, allRecords: PayslipVerifyRecord[]): PayslipVerifyRecord[] {
  const { year, month } = parsePayPeriod(payPeriod)
  return allRecords
    .filter((r) => {
      const p = parsePayPeriod(r.payPeriod)
      return p.year === year && p.month < month
    })
    .sort((a, b) => parsePayPeriod(a.payPeriod).month - parsePayPeriod(b.payPeriod).month)
}

/**
 * store 记录 → 核对引擎输入（工资条字段，用于个税/税后比对与税后自洽）
 * @note 计税收入不走这里；由 currentMonth=recordToSnapshot 覆盖
 */
function recordToVerifyInput(record: PayslipVerifyRecord): PayslipVerifyInput {
  return {
    payPeriod: record.payPeriod,
    preTaxMonthly: record.preTaxMonthly,
    ssPersonalAmount: record.ssPersonalAmount,
    hfPersonalAmount: record.hfPersonalAmount,
    otherDeductionAmount: record.otherDeductionAmount,
    specialDeductionMonthly: record.specialDeductionMonthly,
    personalIncomeTax: record.personalIncomeTax,
    postTaxMonthly: record.postTaxMonthly,
  }
}

/**
 * 组装核对引擎 options：prior + 当月均走计入累计净额快照
 * @note 当月用 recordToSnapshot，避免确认修正后累计仍按工资条应发
 */
function buildVerifyOptions(
  record: PayslipVerifyRecord,
  allRecords: PayslipVerifyRecord[],
) {
  const priorRecords = getPriorRecords(record.payPeriod, allRecords)
  const missing = listMissingPriorMonths(record.payPeriod, allRecords)
  return {
    priorMonths: priorRecords.map(recordToSnapshot),
    missingPriorMonths: missing,
    currentMonth: recordToSnapshot(record),
  }
}

/**
 * 按累计预扣法重算单条历史记录的核对结果
 * @param allRecords 同年历史全集；缺月会体现在 missingPriorMonths，影响可核对性
 */
export function computeVerifyForRecord(
  record: PayslipVerifyRecord,
  allRecords: PayslipVerifyRecord[],
): PayslipVerifyResult {
  return verifyPayslipTax(recordToVerifyInput(record), buildVerifyOptions(record, allRecords))
}

/**
 * 核对结果 + 累计预扣明细（详情页表格用）
 * @see computeVerifyForRecord 入参约定相同
 */
export function computeVerifyBreakdown(
  record: PayslipVerifyRecord,
  allRecords: PayslipVerifyRecord[],
): PayslipVerifyBreakdownResult {
  return verifyPayslipTaxBreakdown(recordToVerifyInput(record), buildVerifyOptions(record, allRecords))
}

/** 列表/详情用异常摘要：优先报税偏差提示，否则个税/税后差异 */
export function formatVerifyAbnormalSummary(result: PayslipVerifyResult): string {
  if (result.reportBias === 'under' && result.inferredPreTax != null) {
    return `报税偏低（约 ¥${formatSalaryAmount(result.inferredPreTax)}）`
  }
  if (result.reportBias === 'over' && result.inferredPreTax != null) {
    return `报税偏高（约 ¥${formatSalaryAmount(result.inferredPreTax)}）`
  }
  const parts: string[] = []
  if (!result.taxMatch) {
    const sign = result.taxDiff > 0 ? '+' : ''
    parts.push(`个税差异 ${sign}${formatSalaryAmount(result.taxDiff)}`)
  }
  if (!result.postTaxMatch) {
    const sign = result.postTaxDiff > 0 ? '+' : ''
    parts.push(`税后差异 ${sign}${formatSalaryAmount(result.postTaxDiff)}`)
  }
  return parts.join('；')
}
