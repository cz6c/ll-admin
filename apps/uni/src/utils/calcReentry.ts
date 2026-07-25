/**
 * 年薪测算「重新测算」路由短字段
 * 职责：详情 → 测算页 query 编解码（短键压缩 URL）；带 id 表示编辑更新
 */
import type { SalaryCalcInput, YearEndTaxMode } from '@/utils/salaryCalculator'

const YEAR_END_MODES: readonly YearEndTaxMode[] = ['none', 'separate', 'merge']

/** 短键 → 金额字段（不含计税方式） */
const AMOUNT_SHORT_KEYS = {
  pt: 'preTaxMonthly',
  yb: 'yearEndBonus',
  ss: 'ssPersonalAmount',
  hf: 'hfPersonalAmount',
  sd: 'specialDeductionMonthly',
} as const satisfies Record<string, keyof Omit<SalaryCalcInput, 'yearEndTaxMode'>>

const REENTRY_QUERY_KEYS = [...Object.keys(AMOUNT_SHORT_KEYS), 'ym', 'id'] as const

export interface CalcReentryPayload {
  /** 有值时测算页提交按 id 更新 */
  id?: string
  form: SalaryCalcInput
}

function toAmount(raw: unknown): number {
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

function parseYearEndMode(raw: unknown): YearEndTaxMode {
  const s = String(raw ?? '')
  return (YEAR_END_MODES as readonly string[]).includes(s)
    ? (s as YearEndTaxMode)
    : 'separate'
}

/** 合法正整数字符串才当作编辑 id */
function parseHistoryId(raw: unknown): string | undefined {
  const s = String(raw ?? '').trim()
  if (!/^\d+$/.test(s) || Number(s) <= 0)
    return undefined
  return s
}

/**
 * 由测算入参拼短字段 query（编辑时必带 id）
 * @note 不用 URLSearchParams：微信小程序运行时未实现该全局对象
 * @example id=12&pt=15000&yb=30000&ym=separate&ss=...
 */
export function buildCalcReentryQuery(input: SalaryCalcInput, id: string): string {
  const pairs: [string, string][] = [
    ['id', id],
    ['pt', String(input.preTaxMonthly)],
    ['yb', String(input.yearEndBonus)],
    ['ym', input.yearEndTaxMode],
    ['ss', String(input.ssPersonalAmount)],
    ['hf', String(input.hfPersonalAmount)],
    ['sd', String(input.specialDeductionMonthly)],
  ]
  return pairs
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

/**
 * 解析测算页 onLoad options；无回填键则返回 null（调用方用默认表单）
 */
export function parseCalcReentryQuery(
  options?: Record<string, string>,
): CalcReentryPayload | null {
  if (!options)
    return null
  const hasAny = REENTRY_QUERY_KEYS.some((k) => {
    const v = options[k]
    return v != null && String(v).trim() !== ''
  })
  if (!hasAny)
    return null

  return {
    id: parseHistoryId(options.id),
    form: {
      preTaxMonthly: toAmount(options.pt),
      yearEndBonus: toAmount(options.yb),
      yearEndTaxMode: parseYearEndMode(options.ym),
      ssPersonalAmount: toAmount(options.ss),
      hfPersonalAmount: toAmount(options.hf),
      specialDeductionMonthly: toAmount(options.sd),
    },
  }
}
