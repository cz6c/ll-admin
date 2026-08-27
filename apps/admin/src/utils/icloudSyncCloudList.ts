/**
 * iCloud 云资产抽屉列表 — 应用层
 * 职责：Live Photo still+mov 合并为一条展示；删/撤时映射为后端 part 键
 * 适用：IcloudSyncFab 抽屉列表；UI 只消费合并后的行，不处理 part 拆分
 */

import type { IcloudSyncDeleteAssetItem, IcloudSyncSyncAssetRow } from "@/api/icloudSync";

/** 抽屉列表行（rowKey 已归一） */
export type IcloudSyncCloudListRow = IcloudSyncSyncAssetRow & { rowKey: string };

/**
 * Live / 合并行展示用文件名字符串（still, mov 逗号拼接）
 * @note catalog 常给 still/mov 同一 filename；后端会推导 .MOV 或读 mov dest  basename
 */
export function cloudListDisplayFilename(row: IcloudSyncSyncAssetRow): string {
  const still = row.originalFilename.trim();
  const mov = row.liveMovFilename?.trim();
  if (mov && mov !== still) return `${still}, ${mov}`;
  if (row.mediaKind === "live" || row.part === "still") {
    const derived = still.replace(/\.[^.]+$/, "") + ".MOV";
    if (derived !== still) return `${still}, ${derived}`;
  }
  return still;
}

/** still+mov 任一侧 failed 即下载失败；任一侧 pending 视为未完成（cloud_state 仍主导） */
function pairDownloadStatus(still?: string | null, mov?: string | null): string | null {
  const list = [still, mov].filter((s): s is string => Boolean(s));
  if (list.some(s => s === "failed")) return "failed";
  if (list.some(s => s === "pending")) return "pending";
  return null;
}

function isLiveRow(row: IcloudSyncSyncAssetRow): boolean {
  return row.mediaKind === "live" || row.part === "still" || row.part === "mov";
}

/**
 * 合并 Live 成对行：同一 assetId 只保留 still（无 still 时保留 mov）
 * @note 与 Rust load_assets 隐藏 mov 互补；分页结果再兜底去重
 */
export function mergeLiveSyncAssetRows(items: IcloudSyncSyncAssetRow[]): IcloudSyncSyncAssetRow[] {
  const stillByAsset = new Map<string, IcloudSyncSyncAssetRow>();
  const movByAsset = new Map<string, IcloudSyncSyncAssetRow>();
  const others: IcloudSyncSyncAssetRow[] = [];

  for (const row of items) {
    if (row.part === "still") {
      stillByAsset.set(row.assetId, row);
    } else if (row.part === "mov") {
      movByAsset.set(row.assetId, row);
    } else {
      others.push(row);
    }
  }

  const merged: IcloudSyncSyncAssetRow[] = [...others];
  const liveIds = new Set([...stillByAsset.keys(), ...movByAsset.keys()]);
  for (const assetId of liveIds) {
    const still = stillByAsset.get(assetId);
    const mov = movByAsset.get(assetId);
    const base = still ?? mov!;
    merged.push({
      ...base,
      indexNum: still?.indexNum ?? mov?.indexNum ?? base.indexNum,
      liveMovFilename: still?.liveMovFilename ?? mov?.originalFilename ?? base.liveMovFilename,
      liveMovDownloadStatus: still?.liveMovDownloadStatus ?? mov?.downloadStatus ?? base.liveMovDownloadStatus
    });
  }

  return merged.sort((a, b) => {
    const ka = a.sortKey ?? "";
    const kb = b.sortKey ?? "";
    if (ka !== kb) return ka.localeCompare(kb);
    return a.assetId.localeCompare(b.assetId);
  });
}

/**
 * 转为抽屉展示行（合并 Live + 统一 rowKey=assetId）
 */
export function prepareCloudListRows(items: IcloudSyncSyncAssetRow[]): IcloudSyncCloudListRow[] {
  return mergeLiveSyncAssetRows(items).map(row => ({
    ...row,
    rowKey: row.assetId
  }));
}

/**
 * 抽屉列表展示态：以 cloud_state 为主；活跃 job 内 download_status=failed 覆盖为 download_failed
 * @note cloud_state 持久（腾空间/删云）；download_status 仅 job 期间有效，与 cloud_only 待下载高度重叠
 */
export function cloudListDisplayState(row: IcloudSyncSyncAssetRow): string {
  const activeDl = pairDownloadStatus(row.downloadStatus, row.liveMovDownloadStatus);
  if (activeDl === "failed") return "download_failed";
  return row.cloudState;
}

const CLOUD_STATE_LABELS: Record<string, string> = {
  cloud_only: "待下载",
  synced: "已下载到本地",
  modified_cloud: "iCloud 有更新",
  deleted_cloud_pending: "iCloud 已删除",
  cloud_delete_queued: "等待从 iCloud 移除",
  local_missing: "本地文件缺失",
  failed_delete: "从 iCloud 移除失败",
  download_failed: "下载失败"
};

/** 云资产状态 Tag 文案 */
export function cloudStateLabel(state: string): string {
  return CLOUD_STATE_LABELS[state] ?? state;
}

/** 云资产状态 Tag 颜色（Ant Design Vue） */
export function cloudStateColor(state: string): string {
  if (state === "synced") return "success";
  if (state === "cloud_only") return "processing";
  if (state === "modified_cloud") return "blue";
  if (state === "cloud_delete_queued" || state === "local_missing") return "warning";
  if (state === "deleted_cloud_pending" || state === "failed_delete" || state === "download_failed") return "error";
  return "default";
}

/**
 * 删云 / 撤删云入参：Live 固定传 still，后端 expand 成对 mov
 */
export function cloudListRowsToAssetItems(rows: IcloudSyncSyncAssetRow[]): IcloudSyncDeleteAssetItem[] {
  return rows.map(row => ({
    assetId: row.assetId,
    part: isLiveRow(row) && row.part !== "mov" ? "still" : row.part
  }));
}

/**
 * 合并后 total：Rust 已按展示条数计数；此处仅做兜底（减去同页多余 mov）
 */
export function adjustCloudListTotal(rawTotal: number, rawItems: IcloudSyncSyncAssetRow[]): number {
  const hiddenMov = rawItems.filter(
    row => row.part === "mov" && rawItems.some(r => r.assetId === row.assetId && r.part === "still")
  ).length;
  return Math.max(0, rawTotal - hiddenMov);
}
