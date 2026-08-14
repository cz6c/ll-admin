import type { Dayjs } from 'dayjs'
/**
 * 本年累计对照台账模型
 * 职责：按自然年生成 1–12 月行（计入累计应发 / 工资条应发 / 个税 / 状态）与已核合计
 * 适用：verifyYear 对照页；与个税 App「收入纳税明细」逐月对照
 */
import type { PayslipVerifyRecord } from '@/store/salaryHistory'
import dayjs from 'dayjs'
import { buildPayPeriod, parsePayPeriod, previousPayPeriod } from '@/utils/payPeriod'
import { computeVerifyForRecord, effectivePreTaxForCumulative } from '@/utils/payslipVerify'

/** 台账行状态：已按申报优先于有差异 */
export type YearLedgerRowStatus
  = | 'matched'
    | 'mismatched'
    | 'declared'
    | 'missing'
    | 'future'

/** 单月台账行 */
export interface YearLedgerRow {
  month: number
  payPeriod: string
  status: YearLedgerRowStatus
  /** 已核时有值 */
  recordId?: string
  /**
   * 计入累计的应发（主列，对个税 App）
   * @note 确认申报后为 inferredPreTax；待核/未到为 null
   */
  cumulativePreTax: number | null
  /** 工资条应发；待核/未到为 null */
  slipPreTax: number | null
  /** 工资条个税；待核/未到为 null */
  slipTax: number | null
  /** 是否申报口径（主列带 *） */
  useDeclared: boolean
}

/** 本年台账视图 */
export interface YearVerifyLedger {
  year: number
  title: string
  rows: YearLedgerRow[]
  /** 已核月 Σ计入累计应发 */
  sumCumulativePreTax: number
  /** 已核月 Σ工资条个税 */
  sumSlipTax: number
  /** 该年是否尚无任何核对记录 */
  hasAnyVerified: boolean
  /** 空态 CTA：去核对上月 */
  emptyCtaPayPeriod: string
}

/**
 * 某自然年截至「上月」的应核最大月份（1–12）；上月跨年则 0
 * @note 与 buildYearVerifyProgress 截止规则一致
 */
export function resolveLastDueMonthForYear(year: number, now: Dayjs = dayjs()): number {
  const prev = now.subtract(1, 'month')
  return prev.year() === year ? prev.month() + 1 : 0
}

/** 台账状态短文案 */
export function yearLedgerStatusLabel(status: YearLedgerRowStatus): string {
  switch (status) {
    case 'matched':
      return '无误'
    case 'mismatched':
      return '有差异'
    case 'declared':
      return '已按报税'
    case 'missing':
      return '待核'
    case 'future':
      return '未到'
  }
}

/**
 * 组装指定年的累计对照台账
 * @param records 全量核对记录（累计预扣需同年全集，故传入全量而非仅该年）
 * @param year 目标自然年
 * @param now 可注入便于单测
 */
export function buildYearVerifyLedger(
  records: PayslipVerifyRecord[],
  year: number,
  now: Dayjs = dayjs(),
): YearVerifyLedger {
  const lastDueMonth = resolveLastDueMonthForYear(year, now)
  const yearRecords = records.filter(r => parsePayPeriod(r.payPeriod).year === year)
  const byMonth = new Map<number, PayslipVerifyRecord>()
  for (const record of yearRecords) {
    const { month } = parsePayPeriod(record.payPeriod)
    if (month >= 1 && month <= 12)
      byMonth.set(month, record)
  }

  const rows: YearLedgerRow[] = []
  let sumCumulativePreTax = 0
  let sumSlipTax = 0

  for (let month = 1; month <= 12; month++) {
    const payPeriod = buildPayPeriod(year, month)
    if (month > lastDueMonth) {
      rows.push({
        month,
        payPeriod,
        status: 'future',
        cumulativePreTax: null,
        slipPreTax: null,
        slipTax: null,
        useDeclared: false,
      })
      continue
    }

    const record = byMonth.get(month)
    if (!record) {
      rows.push({
        month,
        payPeriod,
        status: 'missing',
        cumulativePreTax: null,
        slipPreTax: null,
        slipTax: null,
        useDeclared: false,
      })
      continue
    }

    const useDeclared = Boolean(record.useInferredForCumulative && record.inferredPreTax != null)
    const cumulativePreTax = effectivePreTaxForCumulative(record)
    const result = computeVerifyForRecord(record, records)
    // 已按申报优先于有差异，便于对照 App 时识别口径
    let status: YearLedgerRowStatus
    if (useDeclared)
      status = 'declared'
    else if (result.overallMatch)
      status = 'matched'
    else
      status = 'mismatched'

    rows.push({
      month,
      payPeriod,
      status,
      recordId: record.id,
      cumulativePreTax,
      slipPreTax: record.preTaxMonthly,
      slipTax: record.personalIncomeTax,
      useDeclared,
    })
    sumCumulativePreTax += cumulativePreTax
    sumSlipTax += record.personalIncomeTax
  }

  return {
    year,
    title: `${year}年累计对照`,
    rows,
    sumCumulativePreTax: Math.round(sumCumulativePreTax * 100) / 100,
    sumSlipTax: Math.round(sumSlipTax * 100) / 100,
    hasAnyVerified: yearRecords.length > 0,
    emptyCtaPayPeriod: previousPayPeriod(),
  }
}
