/**
 * 月薪核对历史 Store
 * 职责：服务端 verify 历史的拉取/按月 upsert/删除；累计预扣 prior 查询
 */
import { defineStore } from 'pinia'
import { deleteSalaryVerifyHistory, getSalaryVerifyHistoryList, upsertSalaryVerifyHistory } from '@/api/salary-verify'
import { isPriorHistoryComplete, parsePayPeriod } from '@/utils/payPeriod'

/** 月薪核对历史中的一条（前端展示态） */
export interface PayslipVerifyRecord {
  /** 服务端数字 id 的字符串形式 */
  id: string
  /** 工资所属月份，格式 YYYY-MM */
  payPeriod: string
  /** 税前应发 */
  preTaxMonthly: number
  /** 个人社保合计 */
  ssPersonalAmount: number
  /** 个人公积金 */
  hfPersonalAmount: number
  /** 专项附加扣除（月） */
  specialDeductionMonthly: number
  /** 工资条个税 */
  personalIncomeTax: number
  /** 工资条税后 */
  postTaxMonthly: number
  updateTime: string
}

/** 接口缺 updateTime 时用当前时刻，避免排序得到 NaN */
function mapUpdateTime(updateTime?: string): string {
  return updateTime || new Date().toISOString()
}

/** 月薪核对历史：服务端为主，Store 仅作页面态缓存。 */
export const useSalaryVerifyHistoryStore = defineStore('salaryVerifyHistory', {
  state: () => ({
    items: [] as PayslipVerifyRecord[],
  }),

  actions: {
    /** 拉取核对历史；keyword 透传列表接口 */
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

    /**
     * 按 payPeriod upsert：同月覆盖，列表头部更新为最新一条
     * @note 同时按 id 去重，避免覆盖后旧 id 残留
     */
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

    /** 软删服务端记录并同步本地缓存；非法 id 直接抛错 */
    async removeById(id: string) {
      const numericId = Number(id)
      if (!Number.isInteger(numericId) || numericId <= 0)
        throw new Error('历史记录ID不合法')
      await deleteSalaryVerifyHistory(numericId)
      this.items = this.items.filter(i => i.id !== id)
    },

    /** 按 id 查缓存；详情页用 */
    findById(id: string): PayslipVerifyRecord | undefined {
      return this.items.find(i => i.id === id)
    },

    /** 按所属月查缓存；录入页判重/回填 */
    findByPayPeriod(payPeriod: string): PayslipVerifyRecord | undefined {
      return this.items.find(i => i.payPeriod === payPeriod)
    },

    /** 同年且月份小于目标月的记录，按月份升序（累计预扣 priorMonths） */
    getPriorRecords(payPeriod: string): PayslipVerifyRecord[] {
      const { year, month } = parsePayPeriod(payPeriod)
      return this.items
        .filter((r) => {
          const p = parsePayPeriod(r.payPeriod)
          return p.year === year && p.month < month
        })
        .sort((a, b) => parsePayPeriod(a.payPeriod).month - parsePayPeriod(b.payPeriod).month)
    },

    /** 同年 1..M-1 是否均有记录；缺月时详情页需提示补全 */
    isPriorComplete(payPeriod: string): boolean {
      return isPriorHistoryComplete(payPeriod, this.items)
    },
  },
})
