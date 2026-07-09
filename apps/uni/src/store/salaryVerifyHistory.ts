import { defineStore } from 'pinia'
import { isPriorHistoryComplete, parsePayPeriod } from '@/utils/payPeriod'

const MAX = 48

export interface PayslipVerifyRecord {
  id: string
  /** 工资所属月份，格式 YYYY-MM */
  payPeriod: string
  preTaxMonthly: number
  ssPersonalAmount: number
  hfPersonalAmount: number
  specialDeductionMonthly: number
  personalIncomeTax: number
  postTaxMonthly: number
  savedAt: number
}

/** 工资核对历史：Pinia persist → `salary-verify-history` */
export const useSalaryVerifyHistoryStore = defineStore('salaryVerifyHistory', {
  state: () => ({
    items: [] as PayslipVerifyRecord[],
  }),

  actions: {
    upsertByPayPeriod(entry: Omit<PayslipVerifyRecord, 'savedAt'> & { savedAt?: number }) {
      const row: PayslipVerifyRecord = {
        ...entry,
        savedAt: entry.savedAt ?? Date.now(),
      }
      this.items = [
        row,
        ...this.items.filter(i => i.payPeriod !== row.payPeriod && i.id !== row.id),
      ].slice(0, MAX)
    },

    removeById(id: string) {
      this.items = this.items.filter(i => i.id !== id)
    },

    findByPayPeriod(payPeriod: string): PayslipVerifyRecord | undefined {
      return this.items.find(i => i.payPeriod === payPeriod)
    },

    /** 同年且月份小于目标月的记录，按月份升序 */
    getPriorRecords(payPeriod: string): PayslipVerifyRecord[] {
      const { year, month } = parsePayPeriod(payPeriod)
      return this.items
        .filter((r) => {
          const p = parsePayPeriod(r.payPeriod)
          return p.year === year && p.month < month
        })
        .sort((a, b) => parsePayPeriod(a.payPeriod).month - parsePayPeriod(b.payPeriod).month)
    },

    isHistoryComplete(payPeriod: string): boolean {
      return isPriorHistoryComplete(payPeriod, this.items)
    },
  },

  persist: {
    key: 'salary-verify-history',
    paths: ['items'],
  },
})
