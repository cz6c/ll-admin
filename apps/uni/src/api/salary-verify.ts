import { http } from '@/http/http'

export interface SalaryVerifyHistoryItem {
  id: number
  payPeriod: string
  preTaxMonthly: number
  ssPersonalAmount: number
  hfPersonalAmount: number
  specialDeductionMonthly: number
  personalIncomeTax: number
  postTaxMonthly: number
  savedAt: number
}

export interface UpsertSalaryVerifyHistoryPayload {
  payPeriod: string
  preTaxMonthly: number
  ssPersonalAmount: number
  hfPersonalAmount: number
  specialDeductionMonthly: number
  personalIncomeTax: number
  postTaxMonthly: number
  savedAt?: number
}

const HISTORY_BASE = '/common/salary-slip/history'

export function upsertSalaryVerifyHistory(data: UpsertSalaryVerifyHistoryPayload) {
  return http.post<SalaryVerifyHistoryItem>(`${HISTORY_BASE}/upsert`, data)
}

export function getSalaryVerifyHistoryList(keyword?: string) {
  return http.get<SalaryVerifyHistoryItem[]>(`${HISTORY_BASE}/list`, keyword ? { keyword } : undefined)
}

export function deleteSalaryVerifyHistory(id: number) {
  return http.post<void>(`${HISTORY_BASE}/delete/${id}`)
}
