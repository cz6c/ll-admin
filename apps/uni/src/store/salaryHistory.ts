import type { SalaryCalcInput } from '@/utils/salaryCalculator'
import { defineStore } from 'pinia'
import { deleteSalaryVerifyHistory, getSalaryVerifyHistoryList, upsertSalaryVerifyHistory } from '@/api/salary-verify'

/** 年薪测算历史列表中的一条 */
export interface SalaryHistoryItem {
  id: string
  savedAt: number
  input: SalaryCalcInput
}

function toHistoryItem(data: {
  id: number
  preTaxMonthly: number
  ssPersonalAmount: number
  hfPersonalAmount: number
  specialDeductionMonthly: number
  yearEndTaxMode: 'none' | 'separate' | 'merge' | null
  yearEndBonus: number
  savedAt: number
}): SalaryHistoryItem {
  return {
    id: String(data.id),
    savedAt: Number(data.savedAt ?? Date.now()),
    input: {
      preTaxMonthly: Number(data.preTaxMonthly ?? 0),
      ssPersonalAmount: Number(data.ssPersonalAmount ?? 0),
      hfPersonalAmount: Number(data.hfPersonalAmount ?? 0),
      specialDeductionMonthly: Number(data.specialDeductionMonthly ?? 0),
      yearEndTaxMode: data.yearEndTaxMode ?? 'none',
      yearEndBonus: Number(data.yearEndBonus ?? 0),
    },
  }
}

/** 薪资测算历史：服务端为主，Store 仅作页面态缓存。 */
export const useSalaryHistoryStore = defineStore('salaryHistory', {
  state: () => ({
    items: [] as SalaryHistoryItem[],
  }),

  actions: {
    async fetchHistory(keyword?: string) {
      const list = await getSalaryVerifyHistoryList({ keyword, historyType: 'calc' })
      this.items = list.map(item => toHistoryItem({
        id: item.id,
        preTaxMonthly: item.preTaxMonthly,
        ssPersonalAmount: item.ssPersonalAmount,
        hfPersonalAmount: item.hfPersonalAmount,
        specialDeductionMonthly: item.specialDeductionMonthly,
        yearEndTaxMode: item.yearEndTaxMode,
        yearEndBonus: item.yearEndBonus,
        savedAt: item.savedAt,
      }))
    },

    async createHistory(input: SalaryCalcInput, savedAt = Date.now()) {
      const data = await upsertSalaryVerifyHistory({
        historyType: 'calc',
        preTaxMonthly: input.preTaxMonthly,
        ssPersonalAmount: input.ssPersonalAmount,
        hfPersonalAmount: input.hfPersonalAmount,
        specialDeductionMonthly: input.specialDeductionMonthly,
        yearEndTaxMode: input.yearEndTaxMode,
        yearEndBonus: input.yearEndBonus,
        savedAt,
      })
      const row = toHistoryItem({
        id: data.id,
        preTaxMonthly: data.preTaxMonthly,
        ssPersonalAmount: data.ssPersonalAmount,
        hfPersonalAmount: data.hfPersonalAmount,
        specialDeductionMonthly: data.specialDeductionMonthly,
        yearEndTaxMode: data.yearEndTaxMode,
        yearEndBonus: data.yearEndBonus,
        savedAt: data.savedAt,
      })
      this.items = [row, ...this.items.filter(i => i.id !== row.id)]
      return row
    },

    async removeById(id: string) {
      const numericId = Number(id)
      if (!Number.isInteger(numericId) || numericId <= 0)
        throw new Error('历史记录ID不合法')
      await deleteSalaryVerifyHistory(numericId)
      this.items = this.items.filter(i => i.id !== id)
    },

    findById(id: string): SalaryHistoryItem | undefined {
      return this.items.find(i => i.id === id)
    },
  },
})
