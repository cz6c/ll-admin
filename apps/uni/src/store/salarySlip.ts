import { defineStore } from 'pinia'

export type SalarySlipConfidence = 'high' | 'medium' | 'low'

export interface SalarySlipResult {
  name: string | null
  fixed_salary: number | null
  welfare_bonus: number | null
  gross_pay: number | null
  total_deductions: number | null
  net_pay: number | null
  pay_date: string | null
  line_items?: Record<string, number | null>
  template_id?: string
  confidence?: SalarySlipConfidence
  warnings?: string[]
}

export function createEmptySalarySlipResult(): SalarySlipResult {
  return {
    name: null,
    fixed_salary: null,
    welfare_bonus: null,
    gross_pay: null,
    total_deductions: null,
    net_pay: null,
    pay_date: null,
  }
}

/** 最近一次工资条识别结果（页面间传递） */
export const useSalarySlipStore = defineStore('salarySlip', {
  state: () => ({
    result: createEmptySalarySlipResult() as SalarySlipResult,
    hasResult: false,
  }),

  actions: {
    setResult(result: SalarySlipResult) {
      this.result = { ...result }
      this.hasResult = true
    },
    clear() {
      this.result = createEmptySalarySlipResult()
      this.hasResult = false
    },
  },
})
