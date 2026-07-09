import type { YearEndTaxMode } from '@/utils/salaryCalculator'

export interface SalaryOption<T extends string = string> {
  label: string
  value: T
}

/** 年终计税方式 */
export const YEAR_END_TAX_OPTIONS: SalaryOption<YearEndTaxMode>[] = [
  { label: '不计税', value: 'none' },
  { label: '单独计税', value: 'separate' },
  { label: '并入综合所得', value: 'merge' },
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
