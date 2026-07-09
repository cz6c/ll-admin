import type { PayslipVerifyRecord } from '@/store/salaryVerifyHistory'

/** 由时间戳格式化为 YYYY-MM（取本地年月） */
export function formatPayPeriod(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  return `${y}-${String(m).padStart(2, '0')}`
}

/** 解析 YYYY-MM */
export function parsePayPeriod(payPeriod: string): { year: number, month: number } {
  const [y, m] = payPeriod.split('-').map(Number)
  return { year: y, month: m }
}

/** 展示用：2026年8月 */
export function formatPayPeriodLabel(payPeriod: string): string {
  const { year, month } = parsePayPeriod(payPeriod)
  return `${year}年${month}月`
}

/** 当月 1 日 0 点的时间戳（本地） */
export function payPeriodToTimestamp(payPeriod: string): number {
  const { year, month } = parsePayPeriod(payPeriod)
  return new Date(year, month - 1, 1).getTime()
}

/** 由 year、month 构造 YYYY-MM */
export function buildPayPeriod(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

/** 当前自然月的 YYYY-MM */
export function currentPayPeriod(): string {
  return formatPayPeriod(Date.now())
}

/** 上一自然月的 YYYY-MM */
export function previousPayPeriod(): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return formatPayPeriod(d.getTime())
}

/** 同年 1..M-1 中缺失的月份序号 */
export function listMissingPriorMonths(
  payPeriod: string,
  records: PayslipVerifyRecord[],
): number[] {
  const { year, month } = parsePayPeriod(payPeriod)
  if (month <= 1)
    return []
  const existing = new Set(
    records
      .filter(r => parsePayPeriod(r.payPeriod).year === year)
      .map(r => parsePayPeriod(r.payPeriod).month),
  )
  const missing: number[] = []
  for (let m = 1; m < month; m++) {
    if (!existing.has(m))
      missing.push(m)
  }
  return missing
}

/** 同年 1..M-1 是否均有记录 */
export function isPriorHistoryComplete(
  payPeriod: string,
  records: PayslipVerifyRecord[],
): boolean {
  return listMissingPriorMonths(payPeriod, records).length === 0
}
