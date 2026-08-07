/**
 * 月薪核对「重新核对」路由短字段
 * 职责：详情 → 核对页 query 编解码（短键压缩 URL）；带 id 表示编辑更新
 */
import type { PayslipVerifyRecord } from '@/store/salaryHistory'
import type { PayslipMappedFields } from '@/utils/salarySlipFieldMap'

/** 所属月 YYYY-MM */
const PAY_PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** 短键 → 表单金额字段 */
const AMOUNT_SHORT_KEYS = {
  pt: 'preTaxMonthly',
  ss: 'ssPersonalAmount',
  hf: 'hfPersonalAmount',
  od: 'otherDeductionAmount',
  sd: 'specialDeductionMonthly',
  tax: 'personalIncomeTax',
  net: 'postTaxMonthly',
} as const satisfies Record<string, keyof PayslipMappedFields>

export interface VerifyReentryPayload {
  /** 有值时核对页提交按 id 更新 */
  id?: string
  payPeriod: string
  form: PayslipMappedFields
  /** 为 true 时核对页禁用所属月 */
  lockPayPeriod: boolean
}

function toAmount(raw: unknown): number {
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

/** 合法正整数字符串才当作编辑 id */
function parseHistoryId(raw: unknown): string | undefined {
  const s = String(raw ?? '').trim()
  if (!/^\d+$/.test(s) || Number(s) <= 0)
    return undefined
  return s
}

/**
 * 由核对记录拼短字段 query（含 id、lock=1）
 * @note 不用 URLSearchParams：微信小程序运行时未实现该全局对象
 * @example id=12&p=2026-06&pt=15000&ss=...&lock=1
 */
export function buildVerifyReentryQuery(record: PayslipVerifyRecord): string {
  const pairs: [string, string][] = [
    ['id', record.id],
    ['p', record.payPeriod],
    ['pt', String(record.preTaxMonthly)],
    ['ss', String(record.ssPersonalAmount)],
    ['hf', String(record.hfPersonalAmount)],
    ['od', String(record.otherDeductionAmount)],
    ['sd', String(record.specialDeductionMonthly)],
    ['tax', String(record.personalIncomeTax)],
    ['net', String(record.postTaxMonthly)],
    ['lock', '1'],
  ]
  return pairs
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

/**
 * 解析核对页 onLoad options；p 非法则返回 null（调用方走默认上月）
 */
export function parseVerifyReentryQuery(
  options?: Record<string, string>,
): VerifyReentryPayload | null {
  const payPeriod = String(options?.p || '').trim()
  if (!PAY_PERIOD_RE.test(payPeriod))
    return null

  const form = {} as PayslipMappedFields
  for (const [shortKey, field] of Object.entries(AMOUNT_SHORT_KEYS))
    form[field] = toAmount(options?.[shortKey])

  return {
    id: parseHistoryId(options?.id),
    payPeriod,
    form,
    lockPayPeriod: String(options?.lock || '') === '1',
  }
}
