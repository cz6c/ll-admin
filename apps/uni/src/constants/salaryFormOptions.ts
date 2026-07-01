import type { HfPaymentType, SsPaymentType, YearEndTaxMode } from '@/utils/salaryCalculator'

export interface SalaryOption<T extends string = string> {
  label: string
  value: T
}

/** 社保计算方式 */
export const SS_PAYMENT_OPTIONS: SalaryOption<SsPaymentType>[] = [
  { label: '按基数比例计算', value: 'base' },
  { label: '按个缴金额计算', value: 'custom' },
]

/** 年终计税方式 */
export const YEAR_END_TAX_OPTIONS: SalaryOption<YearEndTaxMode>[] = [
  { label: '不计税', value: 'none' },
  { label: '单独计税', value: 'separate' },
  { label: '并入综合所得', value: 'merge' },
]

/** 公积金计算方式 */
export const HF_PAYMENT_OPTIONS: SalaryOption<HfPaymentType>[] = [
  { label: '不缴纳', value: 'none' },
  { label: '按基数比例计算', value: 'base' },
  { label: '按个缴金额计算', value: 'custom' },
]

export function salaryOptionLabel<T extends string>(
  options: SalaryOption<T>[],
  value: string,
): string {
  const row = options.find(o => o.value === value)
  if (row)
    return row.label
  return ''
}
