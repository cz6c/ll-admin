/**
 * iCloud 批量下载 / 移除 — 近一年保护
 * 职责：按 captureAt / sortKey 判断是否落在近一年内
 * 适用：设置 batchRemoveSkipRecentYear 开启时，下载/移除意图宫格再滤近一年项
 */
import { dateUtil } from "@llcz/common";
import type { IcloudSyncSyncAssetRow } from "@/api/icloudSync";

/** 移除意图参考时间（ms）；无法判断时返回 null（不保护） */
export function icloudRemoveReferenceMs(row: Pick<IcloudSyncSyncAssetRow, "captureAt" | "sortKey">): number | null {
  const capture = row.captureAt?.trim();
  if (capture) {
    const d = dateUtil(capture);
    if (d.isValid()) return d.valueOf();
  }
  const sort = row.sortKey?.trim();
  if (sort) {
    const d = dateUtil(sort);
    if (d.isValid()) return d.valueOf();
  }
  return null;
}

/** 是否受「近一年不移除」保护 */
export function isIcloudRemoveRecentYearProtected(row: Pick<IcloudSyncSyncAssetRow, "captureAt" | "sortKey">, nowMs = Date.now()): boolean {
  const t = icloudRemoveReferenceMs(row);
  if (t == null) return false;
  const cutoff = dateUtil(nowMs).subtract(1, "year").valueOf();
  return t >= cutoff;
}
