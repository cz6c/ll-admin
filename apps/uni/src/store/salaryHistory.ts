/**
 * 年薪测算历史 Store
 * 职责：服务端 calc 历史的拉取/写入/删除；页面仅缓存 items
 */
import type { SalaryCalcInput } from '@/utils/salaryCalculator'
import { defineStore } from 'pinia'
import { deleteSalaryVerifyHistory, getSalaryVerifyHistoryList, upsertSalaryVerifyHistory } from '@/api/salary-verify'

/** 年薪测算历史列表中的一条（前端展示态） */
export interface SalaryHistoryItem {
  /** 服务端数字 id 的字符串形式，便于路由 query */
  id: string
  updateTime: string
  /** 测算表单快照，用于重算年薪与进详情 */
  input: SalaryCalcInput
}

/** 接口 DTO → 页面态；id 转 string，金额 Number 化，缺省年终奖模式为 none */
function toHistoryItem(data: {
  id: number
  preTaxMonthly: number
  ssPersonalAmount: number
  hfPersonalAmount: number
  specialDeductionMonthly: number
  yearEndTaxMode: 'none' | 'separate' | 'merge' | null
  yearEndBonus: number
  updateTime: string
}): SalaryHistoryItem {
  return {
    id: String(data.id),
    updateTime: data.updateTime || new Date().toISOString(),
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
    /** 拉取测算历史；keyword 透传列表接口 */
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
        updateTime: item.updateTime,
      }))
    },

    /** 保存一条测算快照并插入列表头部 */
    async createHistory(input: SalaryCalcInput) {
      const data = await upsertSalaryVerifyHistory({
        historyType: 'calc',
        preTaxMonthly: input.preTaxMonthly,
        ssPersonalAmount: input.ssPersonalAmount,
        hfPersonalAmount: input.hfPersonalAmount,
        specialDeductionMonthly: input.specialDeductionMonthly,
        yearEndTaxMode: input.yearEndTaxMode,
        yearEndBonus: input.yearEndBonus,
      })
      const row = toHistoryItem({
        id: data.id,
        preTaxMonthly: data.preTaxMonthly,
        ssPersonalAmount: data.ssPersonalAmount,
        hfPersonalAmount: data.hfPersonalAmount,
        specialDeductionMonthly: data.specialDeductionMonthly,
        yearEndTaxMode: data.yearEndTaxMode,
        yearEndBonus: data.yearEndBonus,
        updateTime: data.updateTime,
      })
      this.items = [row, ...this.items.filter(i => i.id !== row.id)]
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

    /** 按 id 查缓存；详情页用，未命中需先 fetchHistory */
    findById(id: string): SalaryHistoryItem | undefined {
      return this.items.find(i => i.id === id)
    },
  },
})
