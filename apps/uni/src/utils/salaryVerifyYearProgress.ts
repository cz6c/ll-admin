/**
 * 首页「本年核对进度」模型
 * 职责：按自然年把核对记录映射为 1–12 月格子状态与摘要
 * 适用：salary/home 进度卡；截止月与核对页一致，用「上月」作为最近应核月
 * @note 去核 / 对照入口分别走月格点击与右上角「对照表」，模型不再带底部 CTA
 */
import type { Dayjs } from 'dayjs'
import type { PayslipVerifyRecord } from '@/store/salaryHistory'
import dayjs from 'dayjs'
import { buildPayPeriod, parsePayPeriod } from '@/utils/payPeriod'
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

/** 首页本年核对进度视图模型 */
export interface YearVerifyProgress {
  year: number
  title: string
  months: YearMonthCell[]
  /** 底部状态一句，不含操作入口 */
  summary: string
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

  if (lastDueMonth === 0) {
    summary = '发了工资条？先核上月'
  }
  else if (missingMonths.length > 0) {
    summary = formatMissingSummary(missingMonths)
  }
  else {
    const dueCell = months.find(cell => cell.month === lastDueMonth)
    if (dueCell?.status === 'matched') {
      summary = `${lastDueMonth} 月已核 · 无误`
    }
    else if (dueCell?.status === 'mismatched') {
      const dueRecord = byMonth.get(lastDueMonth)
      if (dueRecord?.useInferredForCumulative) {
        summary = `${lastDueMonth} 月已核 · 已按个税 App 口径`
      }
      else {
        const bias = dueRecord
          ? (dueRecord.reportBias ?? computeVerifyForRecord(dueRecord, yearRecords).reportBias)
          : null
        if (bias === 'under')
          summary = `${lastDueMonth} 月已核 · 个税 App 收入偏低`
        else if (bias === 'over')
          summary = `${lastDueMonth} 月已核 · 个税 App 收入偏高`
        else
          summary = `${lastDueMonth} 月已核 · 有差异`
      }
    }
    else {
      summary = '今年已核齐'
    }
  }

  return {
    year,
    title,
    months,
    summary,
    missingMonths,
  }
}

/** 缺月文案：最多列 3 个，其余收成「等 N 月」 */
function formatMissingSummary(missingMonths: number[]): string {
  const shown = missingMonths.slice(0, 3)
  // 口语化短句，避免与工具卡 hint 抢篇幅
  const text = `差 ${shown.join('、')} ${missingMonths.length > 3 ? '...等' : ''}月，未核对`
  return text
}
