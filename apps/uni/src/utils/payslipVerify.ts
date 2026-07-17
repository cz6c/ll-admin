import type { PayslipVerifyRecord } from '@/store/salaryVerifyHistory'
import type {
  PayslipMonthSnapshot,
  PayslipVerifyBreakdownResult,
  PayslipVerifyInput,
  PayslipVerifyResult,
} from '@/utils/salaryCalculator'
import { listMissingPriorMonths, parsePayPeriod } from '@/utils/payPeriod'
import { verifyPayslipTax, verifyPayslipTaxBreakdown } from '@/utils/salaryCalculator'

function fmt(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2)
}

export function recordToSnapshot(r: Pick<PayslipVerifyRecord, 'preTaxMonthly' | 'ssPersonalAmount' | 'hfPersonalAmount' | 'specialDeductionMonthly'>): PayslipMonthSnapshot {
  return {
    preTaxMonthly: r.preTaxMonthly,
    ssPersonalAmount: r.ssPersonalAmount,
    hfPersonalAmount: r.hfPersonalAmount,
    specialDeductionMonthly: r.specialDeductionMonthly,
  }
}

function getPriorRecords(payPeriod: string, allRecords: PayslipVerifyRecord[]): PayslipVerifyRecord[] {
  const { year, month } = parsePayPeriod(payPeriod)
  return allRecords
    .filter((r) => {
      const p = parsePayPeriod(r.payPeriod)
      return p.year === year && p.month < month
    })
    .sort((a, b) => parsePayPeriod(a.payPeriod).month - parsePayPeriod(b.payPeriod).month)
}

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

/** 按累计预扣法重算单条历史记录的核对结果 */
export function computeVerifyForRecord(
  record: PayslipVerifyRecord,
  allRecords: PayslipVerifyRecord[],
): PayslipVerifyResult {
  const priorRecords = getPriorRecords(record.payPeriod, allRecords)
  const missing = listMissingPriorMonths(record.payPeriod, allRecords)
  const priorMonths = priorRecords.map(recordToSnapshot)
  return verifyPayslipTax(recordToVerifyInput(record), { priorMonths, missingPriorMonths: missing })
}

/** 核对结果 + 累计预扣明细（详情页） */
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

export function taxDiffHint(diff: number): string {
  const abs = Math.abs(diff)
  if (abs <= 0.01)
    return ''
  if (diff > 0)
    return `公司可能多扣了 ${fmt(abs)}`
  return `公司可能少扣了 ${fmt(abs)}`
}

/** 列表用异常摘要 */
export function formatVerifyAbnormalSummary(result: PayslipVerifyResult): string {
  const parts: string[] = []
  if (!result.taxMatch) {
    const sign = result.taxDiff > 0 ? '+' : ''
    parts.push(`个税差异 ${sign}${fmt(result.taxDiff)}`)
    const hint = taxDiffHint(result.taxDiff)
    if (hint)
      parts.push(hint)
  }
  if (!result.postTaxMatch) {
    const sign = result.postTaxDiff > 0 ? '+' : ''
    parts.push(`税后差异 ${sign}${fmt(result.postTaxDiff)}`)
  }
  return parts.join('；')
}
