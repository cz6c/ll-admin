/**
 * 云同步删云弹窗：结果摘要与归一化结果形态
 * 适用：CloudSyncDeleteDialog；iCloud / QQ 在适配层映射到此结构
 */

/** 进度事件 payload 最小字段 */
export type CloudSyncDeleteProgress = {
  processed: number;
  total: number;
};

/** 删云命令归一化结果（各云适配后传入弹窗） */
export type CloudSyncDeleteNormalizedResult = {
  deleted: number;
  failed: number;
  message?: string;
  /** 失败须保留勾选的 assetId */
  failedAssetIds: string[];
  rejected?: number;
  rejectedLocalMissing?: number;
  rejectedMissingCpl?: number;
  rejectedAssetIds?: string[];
};

export type CloudSyncDeleteResultStatus = "success" | "warning" | "error";

export type CloudSyncDeleteSummary = {
  status: CloudSyncDeleteResultStatus;
  title: string;
  lines: string[];
};

/**
 * 将归一化结果或错误文案收成结果态标题与明细行
 * @param warnOnNoDeletable iCloud「没有可删除」前置拦截用 warning 而非 error
 */
export function summarizeCloudSyncDelete(
  result: CloudSyncDeleteNormalizedResult | null,
  errorText: string,
  options?: { warnOnNoDeletable?: boolean }
): CloudSyncDeleteSummary {
  if (!result) {
    const warn = options?.warnOnNoDeletable && errorText.includes("没有可删除");
    return {
      status: warn ? "warning" : "error",
      title: "移除失败",
      lines: [errorText || "未知错误", "所选项已保留勾选"]
    };
  }

  const lines: string[] = [];
  if (result.deleted > 0) lines.push(`已移除 ${result.deleted} 项（本机文件保留）`);
  if (result.failed > 0) {
    lines.push(result.message ? `失败 ${result.failed} 项：${result.message}` : `失败 ${result.failed} 项`);
  }
  const rejectedLocal = result.rejectedLocalMissing ?? 0;
  const rejectedCpl = result.rejectedMissingCpl ?? 0;
  if (rejectedLocal > 0) lines.push(`${rejectedLocal} 项本地文件缺失，已跳过`);
  if (rejectedCpl > 0) lines.push(`${rejectedCpl} 项缺云端元数据，已跳过`);
  const rejectedTotal = result.rejected ?? 0;
  const otherRejected = rejectedTotal - rejectedLocal - rejectedCpl;
  if (otherRejected > 0) lines.push(`${otherRejected} 项已跳过`);
  if (result.failed > 0 || rejectedTotal > 0) lines.push("未移除的项已保留勾选，可稍后重试");

  if (result.failed === 0 && rejectedTotal === 0) return { status: "success", title: "移除完成", lines };
  if (result.deleted === 0 && result.failed > 0) return { status: "error", title: "移除失败", lines };
  return { status: "warning", title: "部分项未移除", lines };
}

/**
 * 结束后应保留勾选的 assetId
 */
export function keepIdsFromCloudSyncDelete(
  result: CloudSyncDeleteNormalizedResult | null,
  itemAssetIds: string[]
): string[] {
  if (!result) return [...new Set(itemAssetIds)];
  const keep = [...(result.failedAssetIds ?? []), ...(result.rejectedAssetIds ?? [])];
  return [...new Set(keep)];
}
