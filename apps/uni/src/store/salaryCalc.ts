import type { SalaryCalcInput, SalaryCalcResult } from '@/utils/salaryCalculator'
import { defineStore } from 'pinia'
import { calcSalary } from '@/utils/salaryCalculator'

function defaultInput(): SalaryCalcInput {
  return {
    cityId: 'shenzhen',
    preTaxMonthly: 10000,
    yearEndTaxMode: 'separate',
    yearEndBonus: 0,
    ssPaymentType: 'custom',
    ssBase: 0,
    ssPersonalAmount: 0,
    hfPaymentType: 'none',
    hfRate: 0.12,
    hfBase: 10000,
    hfPersonalAmount: 0,
    specialDeductionMonthly: 0,
  }
}

export const useSalaryCalcStore = defineStore('salaryCalc', {
  state: () => ({
    input: defaultInput(),
  }),
  getters: {
    result(): SalaryCalcResult {
      return calcSalary(this.input)
    },
  },
  actions: {
    patchInput(p: Partial<SalaryCalcInput>) {
      this.input = { ...this.input, ...p }
    },
    setInput(input: SalaryCalcInput) {
      this.input = { ...input }
    },
    resetInput() {
      this.input = defaultInput()
    },
  },
})
