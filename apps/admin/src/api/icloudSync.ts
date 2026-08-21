/**
 * iCloud 照片同步 Tauri invoke 封装
 * 职责：类型化调用 Rust icloud_sync_* 命令；错误码转用户文案
 * 适用：相册内 iCloud 同步页与设置（仅 CS）
 */

import { invoke } from "@tauri-apps/api/core";

/** 同步任务视图：Library 与 Recents 互斥 */
export type IcloudSyncJobView = "library" | "recents";

/** 任务生命周期状态（与 Rust JobStatus 对齐） */
export type IcloudSyncJobStatus = "pending" | "running" | "paused_session" | "paused_user" | "done" | "failed";

/** 非敏感配置（Apple ID 密码不在此结构） */
export interface IcloudSyncSettings {
  /** 同步落盘绝对路径；空时 Rust 侧推导 albumRoot/iCloudSync */
  outputDir: string;
  /** 并发下载数；P0 固定 1，前端控件灰显 */
  concurrency: number;
  appleId: string;
  /** 已勾选锁号风险 ToS */
  riskAccepted: boolean;
  /** 已确认开启「网页访问 iCloud 数据」 */
  checklistWebAccess: boolean;
  /** 已确认关闭 Advanced Data Protection */
  checklistAdpOff: boolean;
}

/** auth 页 consent / 凭据 / session 概况（不含密码明文） */
export interface IcloudSyncAuthState {
  appleId: string;
  hasPassword: boolean;
  riskAccepted: boolean;
  checklistWebAccess: boolean;
  checklistAdpOff: boolean;
  consentReady: boolean;
  /** session 目录是否有落盘文件；不保证仍有效 */
  sessionPresent: boolean;
}

/** login / submit_2fa 成功时的状态 */
export interface IcloudSyncLoginResult {
  /** `need_2fa`：待二次验证；`ok`：已登录 */
  status: "need_2fa" | "ok" | string;
}

export interface IcloudSyncStartJobResult {
  jobId: number;
}

export interface IcloudSyncJobStatusResult {
  jobId: number;
  status: IcloudSyncJobStatus;
  total: number;
  done: number;
  failed: number;
  pending: number;
}

/** Rust 推送的进度事件负载 */
export interface IcloudSyncProgressPayload {
  done: number;
  total: number;
  filename: string;
}

export const ICLOUD_SYNC_PROGRESS_EVENT = "icloud-sync://progress";

/** Rust 推送的任务状态变更（done / failed / paused 等） */
export const ICLOUD_SYNC_JOB_STATUS_EVENT = "icloud-sync://job-status";

/** 前端持久化当前任务 id，供断点续传与 paused_session 检测 */
export const ICLOUD_SYNC_ACTIVE_JOB_KEY = "icloud-sync.activeJobId";

/** sidecar / 队列机读错误码 */
export const ICLOUD_SYNC_ERROR_CODES = {
  SIDECAR_MISSING: "sidecar_missing",
  SIDECAR_VERSION_MISMATCH: "sidecar_version_mismatch",
  AUTH_FAILED: "auth_failed",
  NEED_2FA: "need_2fa",
  SESSION_EXPIRED: "session_expired",
  ACCOUNT_LOCKED: "account_locked",
  RATE_LIMITED: "rate_limited",
  CATALOG_SORT_MISSING: "catalog_sort_missing",
  LIVE_BIND_MISSING: "live_bind_missing",
  DOWNLOAD_FAILED: "download_failed",
  SIDECAR_CRASHED: "sidecar_crashed"
} as const;

const ERROR_USER_MESSAGES: Record<string, string> = {
  [ICLOUD_SYNC_ERROR_CODES.SIDECAR_MISSING]: "请重装或更新应用",
  [ICLOUD_SYNC_ERROR_CODES.SIDECAR_VERSION_MISMATCH]: "请重装或更新应用",
  [ICLOUD_SYNC_ERROR_CODES.AUTH_FAILED]: "登录失败，请检查 Apple ID 与密码",
  [ICLOUD_SYNC_ERROR_CODES.SESSION_EXPIRED]: "登录状态已失效，请重新登录后继续同步",
  [ICLOUD_SYNC_ERROR_CODES.ACCOUNT_LOCKED]: "账号可能被临时锁定，请前往 Apple 官方页面（iforgot.apple.com）解锁后再试；请勿在本工具内重复尝试登录",
  [ICLOUD_SYNC_ERROR_CODES.RATE_LIMITED]: "请求过于频繁，请稍后再试；请勿在本工具内重复尝试登录",
  [ICLOUD_SYNC_ERROR_CODES.CATALOG_SORT_MISSING]: "目录缺少排序字段，无法创建同步任务；请稍后重试或更换视图",
  [ICLOUD_SYNC_ERROR_CODES.LIVE_BIND_MISSING]: "Live Photo 缺少强绑定字段，无法创建同步任务",
  [ICLOUD_SYNC_ERROR_CODES.SIDECAR_CRASHED]: "同步引擎异常退出，请重新登录后继续"
};

/**
 * 将 invoke 错误或 `code: message` 字符串转为用户可读文案
 * @note sidecar_missing 等不引导安装 Python
 */
export function formatIcloudSyncError(err: unknown): string {
  const raw = typeof err === "string" ? err : err instanceof Error ? err.message : String(err ?? "未知错误");

  const code = raw.split(":")[0]?.trim() ?? raw;
  if (ERROR_USER_MESSAGES[code]) {
    const tail = raw.includes(":") ? raw.slice(raw.indexOf(":") + 1).trim() : "";
    if (tail && !ERROR_USER_MESSAGES[code].includes(tail)) {
      return `${ERROR_USER_MESSAGES[code]}（${tail}）`;
    }
    return ERROR_USER_MESSAGES[code];
  }
  return raw;
}

/** 读取本机 iCloud 同步设置 */
export function getIcloudSyncSettings() {
  return invoke<IcloudSyncSettings>("icloud_sync_get_settings");
}

/** 保存本机 iCloud 同步设置（不含密码） */
export function saveIcloudSyncSettings(settings: IcloudSyncSettings) {
  return invoke<void>("icloud_sync_save_settings", { settings });
}

/** 保存 Apple ID 与密码（密码进 keyring，不进 settings.json） */
export function setIcloudSyncCredentials(appleId: string, password: string) {
  return invoke<void>("icloud_sync_set_credentials", { appleId, password });
}

/** 读取 auth 页 consent / 凭据 / session 概况 */
export function getIcloudSyncAuthState() {
  return invoke<IcloudSyncAuthState>("icloud_sync_auth_state");
}

/** 向 sidecar 发起 auth；需 consent 三门禁 + 已存凭据 */
export function loginIcloudSync() {
  return invoke<IcloudSyncLoginResult>("icloud_sync_login");
}

/** 提交 2FA 验证码 */
export function submitIcloudSync2fa(code: string) {
  return invoke<IcloudSyncLoginResult>("icloud_sync_submit_2fa", { code });
}

/** 启动 sidecar 并返回 agent 版本（冒烟 / 诊断） */
export function pingIcloudSync() {
  return invoke<{ protocol: number; agent: string }>("icloud_sync_ping");
}

/** 新建同步任务：catalog 一次 → 后台串行下载（固定图库视图） */
export function startIcloudSyncJob(view: IcloudSyncJobView = "library") {
  return invoke<IcloudSyncStartJobResult>("icloud_sync_start_job", { view });
}

/** 从断点续传（paused_session / paused_user 等）；session 失效时需用户已重新登录 */
export function resumeIcloudSyncJob(jobId: number) {
  return invoke<void>("icloud_sync_resume_job", { jobId });
}

/** 用户手动暂停正在进行的同步任务 */
export function pauseIcloudSyncJob(jobId: number) {
  return invoke<void>("icloud_sync_pause_job", { jobId });
}

/** 查询任务进度与状态 */
export function getIcloudSyncJobStatus(jobId: number) {
  return invoke<IcloudSyncJobStatusResult>("icloud_sync_job_status", { jobId });
}

/**
 * 读取相册根目录，用于推导默认落盘路径 `{albumRoot}/iCloudSync`
 * @returns 相册根目录；未配置时为空字符串
 */
export async function getAlbumRootForDefault(): Promise<string> {
  try {
    const settings = await invoke<{ rootDir: string }>("album_get_settings");
    return settings.rootDir?.trim() ?? "";
  } catch {
    return "";
  }
}

/**
 * 拼接默认 iCloud 同步落盘子目录
 * @param albumRoot 相册根目录绝对路径
 */
export function buildDefaultOutputDir(albumRoot: string): string {
  const trimmed = albumRoot.trim().replace(/[/\\]+$/, "");
  if (!trimmed) return "";
  const sep = trimmed.includes("\\") ? "\\" : "/";
  return `${trimmed}${sep}iCloudSync`;
}
