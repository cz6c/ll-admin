import { http } from '@/http/http'

export type SalaryHistoryType = 'verify' | 'calc'
export type YearEndTaxMode = 'none' | 'separate' | 'merge'

export interface SalaryVerifyHistoryItem {
  id: number
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
  savedAt: number
}

export interface UpsertSalaryVerifyHistoryPayload {
  historyType?: SalaryHistoryType
  payPeriod?: string
  preTaxMonthly: number
  ssPersonalAmount: number
  hfPersonalAmount: number
  specialDeductionMonthly: number
  personalIncomeTax?: number
  yearEndTaxMode?: YearEndTaxMode
  yearEndBonus?: number
  postTaxMonthly?: number
  savedAt?: number
}

const HISTORY_BASE = '/common/salary-slip/history'

export function upsertSalaryVerifyHistory(data: UpsertSalaryVerifyHistoryPayload) {
  return http.post<SalaryVerifyHistoryItem>(`${HISTORY_BASE}/upsert`, data)
}

export function getSalaryVerifyHistoryList(params?: {
  keyword?: string
  historyType?: SalaryHistoryType
}) {
  return http.get<SalaryVerifyHistoryItem[]>(`${HISTORY_BASE}/list`, params)
}

export function deleteSalaryVerifyHistory(id: number) {
  return http.post<void>(`${HISTORY_BASE}/delete/${id}`)
}
