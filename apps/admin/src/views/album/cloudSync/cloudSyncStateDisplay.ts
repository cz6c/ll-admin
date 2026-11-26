/**
 * 双云云态角标文案与颜色
 * 职责：cloud_only / synced / download_failed 等统一展示语义
 * 适用：iCloud 抽屉、QQ 空间宫格（与后端 cloud_state 字符串对齐）
 */

const CLOUD_STATE_LABELS: Record<string, string> = {
  cloud_only: "待下载",
  modified_cloud: "待下载",
  downloading: "下载中",
  synced: "已下载",
  download_failed: "失败",
  sync_skipped: "跳过下载"
};

/** 云态角标中文文案 */
export function cloudStateLabel(state: string): string {
  return CLOUD_STATE_LABELS[state] ?? state;
}

/**
 * 云态角标 a-tag color
 * @note success / processing / error 与 Ant Design 语义色一致
 */
export function cloudStateTagColor(state: string): string {
  const normalized = state === "modified_cloud" ? "cloud_only" : state;
  if (normalized === "synced") return "success";
  if (normalized === "cloud_only") return "processing";
  if (normalized === "downloading") return "processing";
  if (normalized === "download_failed") return "error";
  if (normalized === "sync_skipped") return "default";
  return "default";
}
