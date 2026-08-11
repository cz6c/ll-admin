/**
 * 工作日报 Tauri invoke 封装
 * 职责：类型化调用 Rust daily_report_* 命令；仅 CS 使用
 * 适用：views/dailyReport 设置/今日/历史页
 */

import { invoke } from "@tauri-apps/api/core";

/** 大小周锚点：大周一～六（单休），小周一～五（双休） */
export type BiweeklyAnchorKind = "big" | "small";

/** 本机非敏感配置（API Key 不在此结构） */
export interface DailyReportSettings {
  workspaceRoot: string;
  /** 已废弃 UI：固定空，作者读本机 git config */
  authorEmail: string;
  /** 已废弃 UI：固定空 */
  authorName: string;
  /** 0 = 全扫 */
  scanDepth: number;
  excludeDirNames: string[];
  scheduleEnabled: boolean;
  scheduleTime: string;
  /** 计划触发星期：1=周一 … 7=周日 */
  scheduleDays: number[];
  /** 是否启用隔周大小周 */
  scheduleBiweeklyEnabled: boolean;
  /** 锚点周周一 YYYY-MM-DD（保存时由后端写入） */
  scheduleBiweeklyAnchorMonday: string;
  scheduleBiweeklyAnchorKind: BiweeklyAnchorKind;
  /** @deprecated 已迁至应用设置；落盘字段仍保留以兼容旧 JSON */
  modelBaseUrl: string;
  /** @deprecated 已迁至应用设置 */
  modelName: string;
  promptTemplate: string;
  /** @deprecated 已迁至应用设置；流水线不读 */
  callAiWhenEmpty: boolean;
  /** @deprecated 已迁至应用设置 */
  minimizeToTrayOnClose: boolean;
  /** @deprecated 已迁至应用设置 */
  autostart: boolean;
}

export interface CommitItem {
  repoName: string;
  repoPath: string;
  hash: string;
  committedAt: string;
  subject: string;
  body: string;
}

export interface RepoStat {
  repoName: string;
  repoPath: string;
  ok: boolean;
  commitCount: number;
  error?: string | null;
}

export type ReportStatus = "success" | "failed" | "empty";

/** 正文来源：明确是否真正调用过模型 */
export type SummarySource = "ai" | "scanLogNoKey" | "scanLogNoCommits" | "scanLogAiFailed";

export interface DailyReport {
  date: string;
  status: ReportStatus;
  summaryMarkdown: string;
  /** 原始扫描日志；未配 AI / 无提交时与 summary 相同 */
  scanLog?: string;
  /** 总结来源；旧报告可能缺失，前端会回退推断 */
  summarySource?: SummarySource;
  rawCommits: CommitItem[];
  repoStats: RepoStat[];
  error?: string | null;
  startedAt: string;
  finishedAt: string;
  modelName: string;
}

/** 读取本机设置 */
export function getDailyReportSettings() {
  return invoke<DailyReportSettings>("daily_report_get_settings");
}

/** 保存本机设置（不含 Key） */
export function saveDailyReportSettings(settings: DailyReportSettings) {
  return invoke<void>("daily_report_save_settings", { settings });
}

/** 完整流水线 */
export function runDailyReport() {
  return invoke<DailyReport>("daily_report_run");
}

/** 内置默认 Prompt 模板 */
export function getDefaultDailyReportPrompt() {
  return invoke<string>("daily_report_default_prompt");
}

/** 历史日期列表（倒序） */
export function listDailyReports() {
  return invoke<string[]>("daily_report_list");
}

/** 按日读取 */
export function getDailyReport(date: string) {
  return invoke<DailyReport | null>("daily_report_get", { date });
}
