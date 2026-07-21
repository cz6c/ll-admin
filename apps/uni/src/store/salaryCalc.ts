/**
 * 年薪测算当前表单态（未落库）
 * 职责：缓存测算输入；getter 实时 calcSalary；提交历史时由页面再调 salaryHistoryStore
 */
import type { SalaryCalcInput, SalaryCalcResult } from '@/utils/salaryCalculator'
import { defineStore } from 'pinia'
import { calcSalary } from '@/utils/salaryCalculator'

/**
 * 默认表单：月薪 10000、单独计税、年终奖 0
 * 单独计税为常见默认，避免用户未选模式时年终奖被并入综合所得
 */
function defaultInput(): SalaryCalcInput {
  return {
    preTaxMonthly: 10000,
    yearEndTaxMode: 'separate',
    yearEndBonus: 0,
    ssPersonalAmount: 0,
    hfPersonalAmount: 0,
    specialDeductionMonthly: 0,
  }
}

export const useSalaryCalcStore = defineStore('salaryCalc', {
  state: () => ({
    input: defaultInput(),
  }),
  getters: {
    /** 随 input 变更实时重算，供测算页/明细页展示 */
    result(): SalaryCalcResult {
      return calcSalary(this.input)
    },
  },
  actions: {
    /** 部分更新输入（表单单项变更） */
    patchInput(p: Partial<SalaryCalcInput>) {
      this.input = { ...this.input, ...p }
    },
    /** 整表替换（从历史快照回填等） */
    setInput(input: SalaryCalcInput) {
      this.input = { ...input }
    },
    /** 恢复默认表单 */
    resetInput() {
      this.input = defaultInput()
    },
  },
})
