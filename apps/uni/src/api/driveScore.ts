/**
 * 试驾体验打分 API
 * 路径前缀 /drive-score，对接 Nest drive-score 模块
 */
import type { DriveScoreScoreKey } from '@/constants/driveScoreDimensions'
import { http } from '@/http/http'

export interface DriveScoreRecord extends Record<DriveScoreScoreKey, number> {
  driveScoreId: number
  vehicleName: string
  remark: string | null
  /** 六维算术平均，保留 1 位小数 */
  totalScore: number
  /** 硬件三项平均，保留 1 位小数 */
  hardwareScore: number
  /** 舒适三项平均，保留 1 位小数 */
  comfortScore: number
  createTime: string
  updateTime: string
}

export interface DriveScorePayload extends Record<DriveScoreScoreKey, number> {
  vehicleName: string
  remark?: string | null
}

const DRIVE_SCORE_BASE = '/drive-score'

export function getDriveScoreList() {
  return http.get<DriveScoreRecord[]>(`${DRIVE_SCORE_BASE}/list`)
}

export function getDriveScoreDetail(id: number) {
  return http.get<DriveScoreRecord>(`${DRIVE_SCORE_BASE}/${id}`)
}

export function createDriveScore(data: DriveScorePayload) {
  return http.post<DriveScoreRecord>(`${DRIVE_SCORE_BASE}/create`, data)
}

export function updateDriveScore(data: DriveScorePayload & { driveScoreId: number }) {
  return http.post<DriveScoreRecord>(`${DRIVE_SCORE_BASE}/update`, data)
}

export function deleteDriveScore(id: number) {
  return http.post(`${DRIVE_SCORE_BASE}/delete/${id}`)
}
