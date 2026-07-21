/**
 * 月薪核对：历史记录 → 累计预扣核对结果的适配层
 * 职责：从 store 记录拼 priorMonths / missingPriorMonths，再调 salaryCalculator 核对
 * 适用：历史列表摘要、核对详情页明细
 */
import type { PayslipVerifyRecord } from '@/store/salaryVerifyHistory'
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
 * 历史记录截取为累计预扣所需的月份快照字段
 * @note 仅含计税输入项，不含工资条上的个税/税后实发
 */
export function recordToSnapshot(r: Pick<PayslipVerifyRecord, 'preTaxMonthly' | 'ssPersonalAmount' | 'hfPersonalAmount' | 'specialDeductionMonthly'>): PayslipMonthSnapshot {
  return {
    preTaxMonthly: r.preTaxMonthly,
    ssPersonalAmount: r.ssPersonalAmount,
    hfPersonalAmount: r.hfPersonalAmount,
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

/** store 记录 → 核对引擎输入（含用户填写的个税/税后，用于比对） */
function recordToVerifyInput(record: PayslipVerifyRecord): PayslipVerifyInput {
  return {
    payPeriod: record.payPeriod,
    preTaxMonthly: record.preTaxMonthly,
    ssPersonalAmount: record.ssPersonalAmount,
    hfPersonalAmount: record.hfPersonalAmount,
    specialDeductionMonthly: record.specialDeductionMonthly,
    personalIncomeTax: record.personalIncomeTax,
    postTaxMonthly: record.postTaxMonthly,
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
  const priorRecords = getPriorRecords(record.payPeriod, allRecords)
  const missing = listMissingPriorMonths(record.payPeriod, allRecords)
  const priorMonths = priorRecords.map(recordToSnapshot)
  return verifyPayslipTax(recordToVerifyInput(record), { priorMonths, missingPriorMonths: missing })
}

/**
 * 核对结果 + 累计预扣明细（详情页表格用）
 * @see computeVerifyForRecord 入参约定相同
 */
export function computeVerifyBreakdown(
  record: PayslipVerifyRecord,
  allRecords: PayslipVerifyRecord[],
): PayslipVerifyBreakdownResult {
  const priorRecords = getPriorRecords(record.payPeriod, allRecords)
  const missing = listMissingPriorMonths(record.payPeriod, allRecords)
  const priorMonths = priorRecords.map(recordToSnapshot)
  return verifyPayslipTaxBreakdown(recordToVerifyInput(record), {
    priorMonths,
    missingPriorMonths: missing,
  })
}

/** 列表/详情用异常摘要：个税/税后差异 + 多扣少扣口语提示 */
export function formatVerifyAbnormalSummary(result: PayslipVerifyResult): string {
  const parts: string[] = []
  if (!result.taxMatch) {
    const sign = result.taxDiff > 0 ? '+' : ''
    parts.push(`个税差异 ${sign}${formatSalaryAmount(result.taxDiff)}`)
    // // 正数：工资条个税高于重算值（可能多扣）
    // const abs = Math.abs(result.taxDiff)
    // if (abs > 0.01) {
    //   parts.push(result.taxDiff > 0
    //     ? `公司可能多扣了 ${formatSalaryAmount(abs)}`
    //     : `公司可能少扣了 ${formatSalaryAmount(abs)}`)
    // }
  }
  if (!result.postTaxMatch) {
    const sign = result.postTaxDiff > 0 ? '+' : ''
    parts.push(`税后差异 ${sign}${formatSalaryAmount(result.postTaxDiff)}`)
  }
  return parts.join('；')
}
