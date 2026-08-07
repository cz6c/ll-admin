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

/** 申报偏差：少报 / 多报（与后端 enum 对齐） */
export type SalaryReportBias = 'under' | 'over'

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
  /** 其他扣款（缺勤等）：只影响实发自洽，不进累计预扣 */
  otherDeductionAmount: number
  specialDeductionMonthly: number
  personalIncomeTax: number
  yearEndTaxMode: YearEndTaxMode | null
  yearEndBonus: number
  postTaxMonthly: number
  /** 用户确认后的反推申报应发 */
  inferredPreTax: number | null
  reportBias: SalaryReportBias | null
  useInferredForCumulative: boolean
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
    otherDeductionAmount: Number(data.otherDeductionAmount ?? 0),
    specialDeductionMonthly: Number(data.specialDeductionMonthly ?? 0),
    personalIncomeTax: Number(data.personalIncomeTax ?? 0),
    yearEndTaxMode: data.yearEndTaxMode,
    yearEndBonus: Number(data.yearEndBonus ?? 0),
    postTaxMonthly: Number(data.postTaxMonthly ?? 0),
    inferredPreTax: data.inferredPreTax == null ? null : Number(data.inferredPreTax),
    reportBias: data.reportBias ?? null,
    useInferredForCumulative: Boolean(data.useInferredForCumulative),
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
    otherDeductionAmount: record.otherDeductionAmount,
    specialDeductionMonthly: record.specialDeductionMonthly,
    personalIncomeTax: record.personalIncomeTax,
    postTaxMonthly: record.postTaxMonthly,
    inferredPreTax: record.inferredPreTax,
    reportBias: record.reportBias,
    useInferredForCumulative: record.useInferredForCumulative,
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

    /**
     * 保存测算：无 id 新增快照；有 id 按 id 更新（重新测算）
     * @param editingId 编辑态历史 id；不传则新建
     */
    async createHistory(input: SalaryCalcInput, editingId?: string) {
      const numericId = editingId ? Number(editingId) : undefined
      if (editingId && (!Number.isInteger(numericId) || (numericId as number) <= 0))
        throw new Error('历史记录ID不合法')
      const data = await upsertSalaryVerifyHistory({
        ...(numericId ? { id: numericId } : {}),
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

    /**
     * 保存核对：无 id 按月 upsert；有 id 按 id 更新（重新核对）
     * @note 默认清空反推三字段（重新录入视为需再次确认）；确认沿用时由详情显式传入
     * @note 不更新 items，返回核对视图供跳转详情
     */
    async upsertByPayPeriod(
      entry: Omit<PayslipVerifyRecord, 'id' | 'updateTime' | 'inferredPreTax' | 'reportBias' | 'useInferredForCumulative'> & {
        id?: string
        inferredPreTax?: number | null
        reportBias?: SalaryReportBias | null
        useInferredForCumulative?: boolean
        /** 为 true 时按 entry 写入反推字段；默认 false 表示重新核对并清空沿用 */
        persistInferred?: boolean
      },
    ) {
      const editingId = entry.id ? Number(entry.id) : undefined
      if (entry.id && (!Number.isInteger(editingId) || (editingId as number) <= 0))
        throw new Error('历史记录ID不合法')
      const persistInferred = Boolean(entry.persistInferred)
      const data = await upsertSalaryVerifyHistory({
        ...(editingId ? { id: editingId } : {}),
        historyType: 'verify',
        payPeriod: entry.payPeriod,
        preTaxMonthly: entry.preTaxMonthly,
        ssPersonalAmount: entry.ssPersonalAmount,
        hfPersonalAmount: entry.hfPersonalAmount,
        otherDeductionAmount: entry.otherDeductionAmount ?? 0,
        specialDeductionMonthly: entry.specialDeductionMonthly,
        personalIncomeTax: entry.personalIncomeTax,
        postTaxMonthly: entry.postTaxMonthly,
        // 重新核对：显式清空，避免未确认反推污染后续累计
        inferredPreTax: persistInferred ? (entry.inferredPreTax ?? null) : null,
        reportBias: persistInferred ? (entry.reportBias ?? null) : null,
        useInferredForCumulative: persistInferred ? Boolean(entry.useInferredForCumulative) : false,
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
