/**
 * 工资所属月（payPeriod）工具
 * 职责：YYYY-MM 解析/展示、当前/上月、累计预扣所需的缺月判定
 * 适用：核对表单、历史列表、verifyPayslipTax 的 history/ideal 分支
 */
import type { PayslipVerifyRecord } from '@/store/salaryHistory'
import dayjs from 'dayjs'

/** 由时间戳格式化为 YYYY-MM（取本地年月） */
export function formatPayPeriod(ts: number): string {
  return dayjs(ts).format('YYYY-MM')
}

/** 解析 YYYY-MM；非法段回落为 0，避免 NaN 传播 */
export function parsePayPeriod(payPeriod: string): { year: number, month: number } {
  const [y, m] = payPeriod.split('-').map(Number)
  return {
    year: Number.isFinite(y) ? y : 0,
    month: Number.isFinite(m) ? m : 0,
  }
}

/** 展示用：2026年8月 */
export function formatPayPeriodLabel(payPeriod: string): string {
  const { year, month } = parsePayPeriod(payPeriod)
  return `${year}年${month}月`
}

/** 当月 1 日 0 点的时间戳（本地） */
export function payPeriodToTimestamp(payPeriod: string): number {
  return dayjs(`${payPeriod}-01`).startOf('day').valueOf()
}

/** 由 year、month 构造 YYYY-MM */
export function buildPayPeriod(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

/** 当前自然月的 YYYY-MM */
export function currentPayPeriod(): string {
  return dayjs().format('YYYY-MM')
}

/** 上一自然月的 YYYY-MM（核对页默认所属月） */
export function previousPayPeriod(): string {
  return dayjs().subtract(1, 'month').format('YYYY-MM')
}

/**
 * 同年 1..M-1 中缺失的月份序号
 * @note 非空时核对应走 ideal（理想推算），不能用残缺 priorMonths 硬算累计预扣
 */
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

/**
 * 同年 1..M-1 是否均有记录
 * @note 为 true 才允许 history 模式用真实前序月薪累计
 */
export function isPriorHistoryComplete(
  payPeriod: string,
  records: PayslipVerifyRecord[],
): boolean {
  return listMissingPriorMonths(payPeriod, records).length === 0
}
