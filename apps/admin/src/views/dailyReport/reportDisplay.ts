/**
 * 工作日报前端展示辅助
 * 职责：状态文案、总结来源判定；时间格式化复用 @llcz/common
 * 适用：views/dailyReport/*
 */

import { formatToDatetime } from "@llcz/common";
import type { DailyReport, ReportStatus, SummarySource } from "@/api/dailyReport";

/** 状态 → 中文 */
export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  success: "成功",
  failed: "失败",
  empty: "无提交"
};

/** 状态 → Element Plus tag type */
export const REPORT_STATUS_TAG: Record<ReportStatus, "success" | "danger" | "info"> = {
  success: "success",
  failed: "danger",
  empty: "info"
};

/** 总结来源 → 元信息文案 */
export const SUMMARY_SOURCE_LABEL: Record<SummarySource, string> = {
  ai: "AI 总结成功",
  scanLogNoKey: "未配置 Key，未调用模型",
  scanLogNoCommits: "无提交，未调用模型",
  scanLogAiFailed: "AI 调用失败，已回退日志"
};

/** 总结来源 → tag type */
export const SUMMARY_SOURCE_TAG: Record<SummarySource, "success" | "warning" | "danger" | "info"> = {
  ai: "success",
  scanLogNoKey: "warning",
  scanLogNoCommits: "info",
  scanLogAiFailed: "danger"
};

/**
 * 展示日报时间戳（RFC3339 / ISO）
 * @note 委托 formatToDatetime，空值显示 "-"
 */
export function formatReportTime(raw?: string | null): string {
  if (!raw) return "-";
  return formatToDatetime(raw) || "-";
}

/** 扫描日志正文（始终可展示） */
export function getScanLogText(report: DailyReport | null | undefined): string {
  if (!report) return "";
  return (report.scanLog || report.summaryMarkdown || "").trim();
}

/**
 * 解析总结来源（优先读落盘字段；旧报告按内容推断）
 */
export function resolveSummarySource(report: DailyReport | null | undefined): SummarySource {
  if (!report) return "scanLogNoKey";
  if (report.summarySource) return report.summarySource;
  // 兼容旧 JSON：无 summarySource 时用 status + 正文差异推断
  if (report.status === "empty") return "scanLogNoCommits";
  if (report.status === "failed" && report.error) return "scanLogAiFailed";
  const summary = (report.summaryMarkdown || "").trim();
  const log = getScanLogText(report);
  if (summary && log && summary !== log) return "ai";
  return "scanLogNoKey";
}

/** 是否有独立于扫描日志的 AI 总结 */
export function hasIndependentAiSummary(report: DailyReport | null | undefined): boolean {
  return resolveSummarySource(report) === "ai";
}

/** 生成完成后的提示文案 */
export function runResultMessage(report: DailyReport): { type: "success" | "warning" | "error" | "info"; message: string } {
  const source = resolveSummarySource(report);
  switch (source) {
    case "ai":
      return { type: "success", message: "AI 总结已生成" };
    case "scanLogNoKey":
      return { type: "warning", message: "未检测到 API Key，已仅输出扫描日志（请到应用设置确认 Key 已保存）" };
    case "scanLogNoCommits":
      return { type: "info", message: "今日无提交，未调用模型" };
    case "scanLogAiFailed":
      return { type: "error", message: report.error || "AI 调用失败，已回退扫描日志" };
    default:
      return { type: "success", message: "日报已生成" };
  }
}
