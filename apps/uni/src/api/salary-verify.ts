/**
 * 薪资历史 API（测算 calc / 核对 verify 共表）
 * 路径前缀 /salary-slip/history，对接 Nest salary-slip 模块
 */
import { http } from '@/http/http'

/** 历史类型：月薪核对 / 年薪测算 */
export type SalaryHistoryType = 'verify' | 'calc'

/**
 * 年终奖计税方式（仅 calc）
 * - none：不计年终奖税
 * - separate：年终奖单独计税
 * - merge：并入综合所得
 */
export type YearEndTaxMode = 'none' | 'separate' | 'merge'

/** 历史列表/写入接口返回的单条记录 */
export interface SalaryVerifyHistoryItem {
  id: number
  historyType: SalaryHistoryType
  /** verify 为 YYYY-MM；calc 恒为 null */
  payPeriod: string | null
  preTaxMonthly: number
  ssPersonalAmount: number
  hfPersonalAmount: number
  specialDeductionMonthly: number
  /** verify 必有；calc 侧一般为 0 */
  personalIncomeTax: number
  /** calc 有值；verify 为 null */
  yearEndTaxMode: YearEndTaxMode | null
  yearEndBonus: number
  /** verify 必有；calc 侧一般为 0 */
  postTaxMonthly: number
  updateTime: string
}

/** 新增或按业务键更新历史；字段随 historyType 校验 */
export interface UpsertSalaryVerifyHistoryPayload {
  /** 默认 verify */
  historyType?: SalaryHistoryType
  /** verify 必填 YYYY-MM */
  payPeriod?: string
  preTaxMonthly: number
  ssPersonalAmount: number
  hfPersonalAmount: number
  specialDeductionMonthly: number
  /** verify 必填 */
  personalIncomeTax?: number
  /** calc 必填 */
  yearEndTaxMode?: YearEndTaxMode
  yearEndBonus?: number
  /** verify 必填 */
  postTaxMonthly?: number
}

const HISTORY_BASE = '/salary-slip/history'

/** 按业务键 upsert：verify 按 user+payPeriod；calc 每次新增一条测算快照 */
export function upsertSalaryVerifyHistory(data: UpsertSalaryVerifyHistoryPayload) {
  return http.post<SalaryVerifyHistoryItem>(`${HISTORY_BASE}/upsert`, data)
}

/**
 * 拉取当前用户历史列表
 * @param params.keyword 匹配 payPeriod / 税前月薪（服务端 LIKE）
 * @param params.historyType 不传则返回两类
 */
export function getSalaryVerifyHistoryList(params?: { keyword?: string, historyType?: SalaryHistoryType }) {
  return http.get<SalaryVerifyHistoryItem[]>(`${HISTORY_BASE}/list`, params)
}

/** 软删单条历史（delFlag） */
export function deleteSalaryVerifyHistory(id: number) {
  return http.post(`${HISTORY_BASE}/delete`, { id })
}
