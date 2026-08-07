/**
 * 首页「本年核对进度」模型
 * 职责：按自然年把核对记录映射为 1–12 月格子状态与摘要/CTA
 * 适用：salary/home 进度卡；截止月与核对页一致，用「上月」作为最近应核月
 */
import type { PayslipVerifyRecord } from '@/store/salaryHistory'
import dayjs, { type Dayjs } from 'dayjs'
import { buildPayPeriod, parsePayPeriod, previousPayPeriod } from '@/utils/payPeriod'
import { computeVerifyForRecord } from '@/utils/payslipVerify'

/** 单月格子状态 */
export type YearMonthStatus = 'matched' | 'mismatched' | 'missing' | 'future'

/** 进度卡单月格 */
export interface YearMonthCell {
  /** 1–12 */
  month: number
  payPeriod: string
  status: YearMonthStatus
  /** 已核记录 id，跳转详情用 */
  recordId?: string
}

/** 进度卡主按钮：去核对应带 payPeriod；已齐则进历史核对 tab */
export type YearProgressCtaMode = 'verify' | 'history'

/** 首页本年核对进度视图模型 */
export interface YearVerifyProgress {
  year: number
  title: string
  months: YearMonthCell[]
  summary: string
  ctaLabel: string
  ctaMode: YearProgressCtaMode
  /** ctaMode=verify 时带入核对页的所属月 */
  ctaPayPeriod?: string
  /** 截至上月仍未核的月份序号 */
  missingMonths: number[]
}

/**
 * 组装本年核对进度
 * @param records 全量核对记录（含跨年，累计预扣需同年全集）
 * @param now 可注入便于单测；默认当前时刻
 */
export function buildYearVerifyProgress(
  records: PayslipVerifyRecord[],
  now: Dayjs = dayjs(),
): YearVerifyProgress {
  const year = now.year()
  const prev = now.subtract(1, 'month')
  // 与核对页默认所属月对齐：只把「≤上月」视为应核；元旦前后上月跨年则本年尚无应核月
  const lastDueMonth = prev.year() === year ? prev.month() + 1 : 0

  const yearRecords = records.filter(r => parsePayPeriod(r.payPeriod).year === year)
  const byMonth = new Map<number, PayslipVerifyRecord>()
  for (const record of yearRecords) {
    const { month } = parsePayPeriod(record.payPeriod)
    if (month >= 1 && month <= 12)
      byMonth.set(month, record)
  }

  const months: YearMonthCell[] = []
  for (let month = 1; month <= 12; month++) {
    const payPeriod = buildPayPeriod(year, month)
    if (month > lastDueMonth) {
      months.push({ month, payPeriod, status: 'future' })
      continue
    }
    const record = byMonth.get(month)
    if (!record) {
      months.push({ month, payPeriod, status: 'missing' })
      continue
    }
    const result = computeVerifyForRecord(record, records)
    months.push({
      month,
      payPeriod,
      status: result.overallMatch ? 'matched' : 'mismatched',
      recordId: record.id,
    })
  }

  const missingMonths = months
    .filter(cell => cell.status === 'missing')
    .map(cell => cell.month)

  const title = `${year}年核对进度`
  let summary: string
  let ctaLabel: string
  let ctaMode: YearProgressCtaMode
  let ctaPayPeriod: string | undefined

  if (lastDueMonth === 0) {
    summary = '发了工资条？先核上月'
    ctaLabel = '去核对'
    ctaMode = 'verify'
    ctaPayPeriod = previousPayPeriod()
  }
  else if (missingMonths.length > 0) {
    summary = formatMissingSummary(missingMonths)
    ctaLabel = '去核对'
    ctaMode = 'verify'
    ctaPayPeriod = buildPayPeriod(year, missingMonths[0])
  }
  else {
    const dueCell = months.find(cell => cell.month === lastDueMonth)
    if (dueCell?.status === 'matched')
      summary = `${lastDueMonth} 月已核 · 无误`
    else if (dueCell?.status === 'mismatched')
      summary = `${lastDueMonth} 月已核 · 有差异`
    else
      summary = '今年已核齐'
    // 与顶栏「全部记录」区分：只进核对 tab
    ctaLabel = '核对记录'
    ctaMode = 'history'
  }

  return {
    year,
    title,
    months,
    summary,
    ctaLabel,
    ctaMode,
    ctaPayPeriod,
    missingMonths,
  }
}

/** 缺月文案：最多列 3 个，其余收成「等 N 月」 */
function formatMissingSummary(missingMonths: number[]): string {
  const shown = missingMonths.slice(0, 3)
  const rest = missingMonths.length - shown.length
  // 口语化短句，避免与工具卡 hint 抢篇幅
  let text = `还差 ${shown.join('、')} 月`
  if (rest > 0)
    text += `…等 ${rest} 月`
  return text
}
