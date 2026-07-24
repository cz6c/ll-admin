/**
 * 薪资历史列表 Store
 * 职责：仅缓存列表 items（由首页/历史页 fetchHistory 写入）；create/upsert/delete 只打接口不改 items
 * 适用：home / history 列表；录入页调写接口；详情页不走本 Store 拉数
 */
import type { SalaryHistoryType, SalaryVerifyHistoryItem, YearEndTaxMode } from '@/api/salary-verify'
import type { SalaryCalcInput } from '@/utils/salaryCalculator'
import { defineStore } from 'pinia'
import {
  deleteSalaryVerifyHistory,
  getSalaryVerifyHistoryList,
  upsertSalaryVerifyHistory,
} from '@/api/salary-verify'

/**
 * Store 内统一历史行（与接口字段对齐 + id 字符串化）
 */
export interface SalaryHistoryRecord {
  id: string
  historyType: SalaryHistoryType
  payPeriod: string | null
  preTaxMonthly: number
  ssPersonalAmount: number
  hfPersonalAmount: number
  specialDeductionMonthly: number
  personalIncomeTax: number
  yearEndTaxMode: YearEndTaxMode | null
  yearEndBonus: number
  postTaxMonthly: number
  updateTime: string
}

/**
 * 核对记录视图（列表摘要 / 录入页本地累计预扣）
 * @note payPeriod 保证非空字符串
 */
export type PayslipVerifyRecord = Omit<SalaryHistoryRecord, 'historyType' | 'payPeriod' | 'yearEndTaxMode' | 'yearEndBonus'> & {
  payPeriod: string
}

/** 接口缺 updateTime 时用当前时刻，避免排序得到 NaN */
function mapUpdateTime(updateTime?: string): string {
  return updateTime || new Date().toISOString()
}

/** 接口 DTO → Store / 页面行 */
export function toHistoryRecord(data: SalaryVerifyHistoryItem): SalaryHistoryRecord {
  return {
    id: String(data.id),
    historyType: data.historyType,
    payPeriod: data.payPeriod,
    preTaxMonthly: Number(data.preTaxMonthly ?? 0),
    ssPersonalAmount: Number(data.ssPersonalAmount ?? 0),
    hfPersonalAmount: Number(data.hfPersonalAmount ?? 0),
    specialDeductionMonthly: Number(data.specialDeductionMonthly ?? 0),
    personalIncomeTax: Number(data.personalIncomeTax ?? 0),
    yearEndTaxMode: data.yearEndTaxMode,
    yearEndBonus: Number(data.yearEndBonus ?? 0),
    postTaxMonthly: Number(data.postTaxMonthly ?? 0),
    updateTime: mapUpdateTime(data.updateTime),
  }
}

/** 测算行 → calcSalary 入参 */
export function toCalcInput(record: SalaryHistoryRecord): SalaryCalcInput {
  return {
    preTaxMonthly: record.preTaxMonthly,
    ssPersonalAmount: record.ssPersonalAmount,
    hfPersonalAmount: record.hfPersonalAmount,
    specialDeductionMonthly: record.specialDeductionMonthly,
    yearEndTaxMode: record.yearEndTaxMode ?? 'none',
    yearEndBonus: record.yearEndBonus,
  }
}

/** 核对行视图；非 verify 或无 payPeriod 时返回 null */
export function toVerifyRecord(record: SalaryHistoryRecord): PayslipVerifyRecord | null {
  if (record.historyType !== 'verify' || !record.payPeriod)
    return null
  return {
    id: record.id,
    payPeriod: record.payPeriod,
    preTaxMonthly: record.preTaxMonthly,
    ssPersonalAmount: record.ssPersonalAmount,
    hfPersonalAmount: record.hfPersonalAmount,
    specialDeductionMonthly: record.specialDeductionMonthly,
    personalIncomeTax: record.personalIncomeTax,
    postTaxMonthly: record.postTaxMonthly,
    updateTime: record.updateTime,
  }
}

/**
 * 列表缓存专用：items 只由 fetchHistory 全量替换；写操作不碰 items
 */
export const useSalaryHistoryStore = defineStore('salaryHistory', {
  state: () => ({
    items: [] as SalaryHistoryRecord[],
  }),

  getters: {
    calcItems(): SalaryHistoryRecord[] {
      return this.items.filter(i => i.historyType === 'calc')
    },
    verifyItems(): PayslipVerifyRecord[] {
      return this.items
        .map(toVerifyRecord)
        .filter((r): r is PayslipVerifyRecord => r != null)
    },
  },

  actions: {
    /** 全量拉取并替换 items（仅首页 / 历史列表页调用） */
    async fetchHistory() {
      const list = await getSalaryVerifyHistoryList()
      this.items = list.map(toHistoryRecord)
    },

    /** 保存测算快照；不更新 items，返回行供跳转详情 */
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
      return toHistoryRecord(data)
    },

    /** 按月 upsert 核对；不更新 items，返回核对视图供当页展示结果 */
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
      const row = toVerifyRecord(toHistoryRecord(data))
      if (!row)
        throw new Error('核对记录保存结果异常')
      return row
    },

    /** 软删；不更新 items（列表页删后自行 fetchHistory） */
    async removeById(id: string) {
      const numericId = Number(id)
      if (!Number.isInteger(numericId) || numericId <= 0)
        throw new Error('历史记录ID不合法')
      await deleteSalaryVerifyHistory(numericId)
    },
  },
})
