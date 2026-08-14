/**
 * 月薪核对：历史记录 → 累计预扣核对结果的适配层
 * 职责：从 store 记录拼 priorMonths / missingPriorMonths，再调 salaryCalculator 核对；
 *       已确认沿用反推的月份（含当月）用申报有效应发进入累计链；
 *       工资条字段仍用于个税/税后比对与税后自洽
 * 适用：历史列表摘要、核对详情页明细
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
 * 参与累计预扣的月度应发：用户确认沿用反推时用 inferredPreTax，否则用工资条应发
 * @note 不得覆盖展示用 preTaxMonthly；计税链（当月 + prior）走此口径
 */
export function effectivePreTaxForCumulative(
  record: Pick<PayslipVerifyRecord, 'preTaxMonthly' | 'inferredPreTax' | 'useInferredForCumulative'>,
): number {
  if (
    record.useInferredForCumulative
    && record.inferredPreTax != null
    && Number.isFinite(record.inferredPreTax)
  ) {
    return record.inferredPreTax
  }
  return record.preTaxMonthly
}

/**
 * 历史记录截取为累计预扣所需的月份快照字段
 * @note 应发走有效口径；未确认申报时其他扣款从累计收入扣减；已确认申报应发则 other=0（避免二次扣减）
 */
export function recordToSnapshot(r: Pick<
  PayslipVerifyRecord,
  'preTaxMonthly' | 'ssPersonalAmount' | 'hfPersonalAmount' | 'otherDeductionAmount' | 'specialDeductionMonthly' | 'inferredPreTax' | 'useInferredForCumulative'
>): PayslipMonthSnapshot {
  const useInferred = Boolean(r.useInferredForCumulative)
  return {
    preTaxMonthly: effectivePreTaxForCumulative(r),
    ssPersonalAmount: r.ssPersonalAmount,
    hfPersonalAmount: r.hfPersonalAmount,
    otherDeductionAmount: useInferred ? 0 : (r.otherDeductionAmount || 0),
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
 * @note 计税应发不走这里；已确认申报时由 currentMonth=recordToSnapshot 覆盖
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
 * 组装核对引擎 options：prior + 当月均走有效应发快照
 * @note 当月用 recordToSnapshot，避免确认申报后累计仍按工资条应发
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

/** 列表/详情用异常摘要：优先申报口径提示，否则个税/税后差异 */
export function formatVerifyAbnormalSummary(result: PayslipVerifyResult): string {
  if (result.reportBias === 'under' && result.inferredPreTax != null) {
    return `申报偏低（约 ¥${formatSalaryAmount(result.inferredPreTax)}）`
  }
  if (result.reportBias === 'over' && result.inferredPreTax != null) {
    return `申报偏高（约 ¥${formatSalaryAmount(result.inferredPreTax)}）`
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
