import { defineStore } from 'pinia'

export interface SalarySlipResult {
  line_items?: Record<string, number | null>
}

export function createEmptySalarySlipResult(): SalarySlipResult {
  return {
    line_items: {},
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
