import { defineStore } from 'pinia'
import { deleteSalaryVerifyHistory, getSalaryVerifyHistoryList, upsertSalaryVerifyHistory } from '@/api/salary-verify'
import { isPriorHistoryComplete, parsePayPeriod } from '@/utils/payPeriod'

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
  updateTime: string
}

function mapUpdateTime(updateTime?: string): string {
  return updateTime || new Date().toISOString()
}

/** 月薪核对历史：服务端为主，Store 仅作页面态缓存。 */
export const useSalaryVerifyHistoryStore = defineStore('salaryVerifyHistory', {
  state: () => ({
    items: [] as PayslipVerifyRecord[],
  }),

  actions: {
    async fetchHistory(keyword?: string) {
      const list = await getSalaryVerifyHistoryList({ keyword, historyType: 'verify' })
      this.items = list
        .map(item => ({
          id: String(item.id),
          payPeriod: item.payPeriod || '',
          preTaxMonthly: Number(item.preTaxMonthly ?? 0),
          ssPersonalAmount: Number(item.ssPersonalAmount ?? 0),
          hfPersonalAmount: Number(item.hfPersonalAmount ?? 0),
          specialDeductionMonthly: Number(item.specialDeductionMonthly ?? 0),
          personalIncomeTax: Number(item.personalIncomeTax ?? 0),
          postTaxMonthly: Number(item.postTaxMonthly ?? 0),
          updateTime: mapUpdateTime(item.updateTime),
        }))
    },

    async upsertByPayPeriod(entry: Omit<PayslipVerifyRecord, 'id' | 'updateTime'>) {
      const data = await upsertSalaryVerifyHistory({
        historyType: 'verify',
        payPeriod: entry.payPeriod,
        preTaxMonthly: entry.preTaxMonthly,
        ssPersonalAmount: entry.ssPersonalAmount,
        hfPersonalAmount: entry.hfPersonalAmount,
        specialDeductionMonthly: entry.specialDeductionMonthly,
        personalIncomeTax: entry.personalIncomeTax,
        postTaxMonthly: entry.postTaxMonthly,
      })
      const row: PayslipVerifyRecord = {
        id: String(data.id),
        payPeriod: data.payPeriod || '',
        preTaxMonthly: Number(data.preTaxMonthly ?? 0),
        ssPersonalAmount: Number(data.ssPersonalAmount ?? 0),
        hfPersonalAmount: Number(data.hfPersonalAmount ?? 0),
        specialDeductionMonthly: Number(data.specialDeductionMonthly ?? 0),
        personalIncomeTax: Number(data.personalIncomeTax ?? 0),
        postTaxMonthly: Number(data.postTaxMonthly ?? 0),
        updateTime: mapUpdateTime(data.updateTime),
      }
      this.items = [row, ...this.items.filter(i => i.payPeriod !== row.payPeriod && i.id !== row.id)]
      return row
    },

    async removeById(id: string) {
      const numericId = Number(id)
      if (!Number.isInteger(numericId) || numericId <= 0)
        throw new Error('历史记录ID不合法')
      await deleteSalaryVerifyHistory(numericId)
      this.items = this.items.filter(i => i.id !== id)
    },

    findById(id: string): PayslipVerifyRecord | undefined {
      return this.items.find(i => i.id === id)
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

    isPriorComplete(payPeriod: string): boolean {
      return isPriorHistoryComplete(payPeriod, this.items)
    },
  },
})
