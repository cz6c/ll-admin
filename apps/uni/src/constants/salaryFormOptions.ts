/**
 * 薪资表单选项常量（测算页年终奖计税方式等）
 */
import type { YearEndTaxMode } from '@/utils/salaryCalculator'

/** picker / action-sheet 通用选项 */
export interface SalaryOption<T extends string = string> {
  label: string
  value: T
}

/** 年终计税方式（与 YearEndTaxMode 一一对应） */
export const YEAR_END_TAX_OPTIONS: SalaryOption<YearEndTaxMode>[] = [
  { label: '不计税', value: 'none' },
  { label: '单独计税', value: 'separate' },
  { label: '并入综合所得', value: 'merge' },
]

/**
 * 由 value 反查选项文案
 * @returns 未命中时返回空串（避免展示 undefined）
 */
export function salaryOptionLabel<T extends string>(
  options: SalaryOption<T>[],
  value: string,
): string {
  const row = options.find(o => o.value === value)
  if (row)
    return row.label
  return ''
}
