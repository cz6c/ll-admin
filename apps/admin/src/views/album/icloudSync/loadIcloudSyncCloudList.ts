/**
 * iCloud 抽屉云资产列表（应用层）
 * 职责：invoke 取 raw 行 → 合并 Live → 展示用 rowKey；total 兜底扣减同页 mov
 * 适用：icloudSync/index.vue 宫格与虚拟列表（勿从 api/icloudSync 再引入）
 */

import { loadIcloudSyncAssets } from "@/api/icloudSync";
import { adjustCloudListTotal, prepareCloudListRows } from "./icloudSyncCloudList";

export type LoadIcloudSyncCloudListOptions = Parameters<typeof loadIcloudSyncAssets>[0];

/** 抽屉列表：合并 Live 行 + 展示用 rowKey；raw 中 mov 行兜底并入 liveMovFilename */
export async function loadIcloudSyncCloudList(options: LoadIcloudSyncCloudListOptions = {}) {
  const raw = await loadIcloudSyncAssets(options);
  const movFilenameByAsset = new Map<string, string>();
  const movDownloadByAsset = new Map<string, string>();
  for (const row of raw.items) {
    if (row.part === "mov") {
      movFilenameByAsset.set(row.assetId, row.originalFilename);
      if (row.downloadStatus) movDownloadByAsset.set(row.assetId, row.downloadStatus);
    }
  }
  const items = prepareCloudListRows(raw.items).map(row => {
    const movName = movFilenameByAsset.get(row.assetId);
    const movDl = movDownloadByAsset.get(row.assetId);
    return {
      ...row,
      liveMovFilename: row.liveMovFilename?.trim() || movName || row.liveMovFilename,
      liveMovDownloadStatus: row.liveMovDownloadStatus ?? movDl ?? row.liveMovDownloadStatus
    };
  });
  return {
    items,
    total: adjustCloudListTotal(raw.total, raw.items)
  };
}
