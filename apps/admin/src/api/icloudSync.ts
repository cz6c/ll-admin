/**
 * iCloud 照片同步 Tauri invoke 封装
 * 职责：类型化调用 Rust icloud_sync_* 命令；错误码转用户文案
 * 适用：相册内 iCloud 同步页与设置（仅 CS）
 */

import { invoke } from "@tauri-apps/api/core";
import { adjustCloudListTotal, prepareCloudListRows } from "@/utils/icloudSyncCloudList";

/** 同步任务视图：Library 与 Recents 互斥 */
export type IcloudSyncJobView = "library" | "recents";

/** 任务生命周期状态（与 Rust JobStatus 对齐） */
export type IcloudSyncJobStatus = "cataloging" | "pending" | "running" | "paused_session" | "paused_user" | "done" | "failed";

/** 全局任务类型（与 Rust TaskType 对齐） */
export type IcloudSyncTaskType = "sync" | "cloudDelete" | "catalog";

/** 非敏感配置（Apple ID 密码不在此结构） */
export interface IcloudSyncSettings {
  /** 同步落盘绝对路径；空时 Rust 侧推导 albumRoot/iCloudSync */
  outputDir: string;
  /** 并发下载数；P1 允许 1–3，由设置页配置 */
  concurrency: number;
  appleId: string;
  /** 已勾选锁号风险 ToS */
  riskAccepted: boolean;
  /** 已确认开启「网页访问 iCloud 数据」 */
  checklistWebAccess: boolean;
  /** 已确认关闭 Advanced Data Protection */
  checklistAdpOff: boolean;
  /** iCloud 根域：`com` 国际 / `cn` 中国大陆 */
  icloudDomain: "com" | "cn";
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
  /** 当前 Apple ID 是否已有专属 session 文件 */
  sessionForCurrentAppleId: boolean;
  /** 已登录（须主动退出后才能再次登录） */
  loggedIn: boolean;
  /** 当前设置的 iCloud 根域 */
  icloudDomain: "com" | "cn";
}

/** login / submit_2fa 返回的状态 */
export interface IcloudSyncLoginResult {
  /** `need_2fa` / `ok` / `error` */
  status: "need_2fa" | "ok" | "error" | string;
  /** pyicloud 2FA 投递：`sms` / `trusted_device` 等 */
  deliveryMethod?: string;
  /** 2FA 引导或错误摘要 */
  detail?: string;
  /** 机读错误码（status=error 时） */
  errorCode?: string;
}

/** sidecar auth-diagnostic.json 落盘结构（仅文件排查用，页面不展示） */
export interface IcloudSyncAuthDiagnostic {
  /** ISO8601 UTC */
  at?: string;
  stage?: string;
  code?: string;
  message?: string;
  appleIdMasked?: string;
  sessionDir?: string;
  hints?: string[];
  userActions?: string[];
  flags?: Record<string, unknown>;
  validatePath?: string | null;
  kickoffPath?: string | null;
  exceptionType?: string | null;
  exceptionDetail?: string | null;
}

export interface IcloudSyncStartJobResult {
  jobId: number;
}

export interface IcloudSyncJobStatusResult {
  jobId: number;
  taskType: IcloudSyncTaskType;
  status: IcloudSyncJobStatus;
  /** 创建任务时的 Apple ID */
  appleId: string;
  /** 任务落盘目录（完成态展示与打开文件夹） */
  outputDir: string;
  total: number;
  done: number;
  failed: number;
  pending: number;
}

/** Rust 推送的进度事件负载 */
export interface IcloudSyncProgressPayload {
  done: number;
  total: number;
  failed: number;
  pending: number;
  filename: string;
}

/** 失败资产摘要（同步页表格） */
export interface IcloudSyncFailedAssetRow {
  indexNum: number;
  part: string;
  originalFilename: string;
  lastError: string;
  attemptCount: number;
}

/** 单文件任务行（全量任务表格） */
export interface IcloudSyncAssetTaskRow {
  indexNum: number;
  part: string;
  originalFilename: string;
  /** pending | done | failed */
  status: "pending" | "done" | "failed" | string;
  lastError?: string | null;
  attemptCount: number;
}

export interface IcloudSyncListAssetTasksResult {
  items: IcloudSyncAssetTaskRow[];
  total: number;
}

/** 抽屉云注册表行 */
export interface IcloudSyncSyncAssetRow {
  assetId: string;
  part: string;
  /** catalog 全局序号（Live still+mov 共享；与落盘 `{index:05d}_` 一致） */
  indexNum: number;
  /**
   * catalog 排序键：Library≈拍摄时间，Recents≈加入图库时间（ISO8601）
   * 列表「拍摄时间」列直接展示此字段
   */
  sortKey: string;
  originalFilename: string;
  /** Live Photo 配对 mov 文件名（catalog 同名时会推导 .MOV） */
  liveMovFilename?: string | null;
  /** Live Photo 配对 mov 的 job 内 download_status */
  liveMovDownloadStatus?: string | null;
  mediaKind: string;
  livePairId?: string | null;
  destPath?: string | null;
  cloudState: string;
  downloadStatus?: string | null;
  lastSyncedAt?: number | null;
  lastCatalogAt?: number | null;
}

export interface IcloudSyncLoadAssetsResult {
  items: IcloudSyncSyncAssetRow[];
  total: number;
}

export interface IcloudSyncCloudStateSummary {
  cloudOnly: number;
  synced: number;
  deletedCloudPending: number;
  cloudDeleteQueued: number;
  failedDelete: number;
  /** 活跃同步任务内 download_status=failed 的行数；任务结束后为 0 */
  downloadFailed: number;
  /** 最近一次 catalog diff 时间戳（秒） */
  lastCatalogAt?: number | null;
}

export type IcloudSyncCloudStateFilter =
  | "all"
  | "cloud_only"
  | "synced"
  | "deleted_cloud_pending"
  | "cloud_delete_queued"
  | "failed_delete"
  | "download_failed";

/** 任务文件状态筛选 */
export type IcloudSyncAssetTaskFilter = "all" | "pending" | "done" | "failed";

/** 并发档位（设置页展示为慢/标准/快） */
export const ICLOUD_SYNC_CONCURRENCY_TIERS = [
  { label: "慢", value: 1, hint: "最稳妥，适合首次同步或大图库" },
  { label: "标准", value: 2, hint: "推荐；速度与稳定性平衡" },
  { label: "快", value: 3, hint: "最快，可能触发 Apple 限流" }
] as const;

export type IcloudSyncConcurrencyTier = (typeof ICLOUD_SYNC_CONCURRENCY_TIERS)[number]["value"];

export const ICLOUD_SYNC_PROGRESS_EVENT = "icloud-sync://progress";

/** Rust 推送的任务状态变更（done / failed / paused 等） */
export const ICLOUD_SYNC_JOB_STATUS_EVENT = "icloud-sync://job-status";

/** 云删入队单项 */
export interface IcloudSyncDeleteAssetItem {
  assetId: string;
  part: string;
}

export interface IcloudSyncDeleteAssetsResult {
  accepted: number;
  rejected: number;
  /** 缺 catalog CPL 元数据 */
  rejectedMissingCpl: number;
  /** 本地 dest_path 缺失或磁盘无文件 */
  rejectedLocalMissing: number;
  jobId: number;
}

export interface IcloudSyncCancelCloudDeleteResult {
  cancelled: number;
}

export interface IcloudSyncRetryCloudDeletesResult {
  retried: number;
  jobId: number;
}

/** 云态变更后刷新 summary / 列表（catalog、下载完成等） */
export const ICLOUD_SYNC_CLOUD_STATE_CHANGED_EVENT = "icloud-sync://cloud-state-changed";

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
  SIDECAR_CRASHED: "sidecar_crashed",
  ACCOUNT_MISMATCH: "account_mismatch",
  ALREADY_LOGGED_IN: "already_logged_in",
  DOMAIN_MISMATCH: "domain_mismatch",
  DELETE_FAILED: "delete_failed",
  TASK_ACTIVE: "task_active"
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
  [ICLOUD_SYNC_ERROR_CODES.SIDECAR_CRASHED]: "同步引擎异常退出，请重新登录后继续",
  [ICLOUD_SYNC_ERROR_CODES.ACCOUNT_MISMATCH]: "当前 Apple ID 与任务创建账号不一致，请开始新同步",
  [ICLOUD_SYNC_ERROR_CODES.ALREADY_LOGGED_IN]: "已处于登录状态，请先退出后再登录",
  [ICLOUD_SYNC_ERROR_CODES.DOMAIN_MISMATCH]: "iCloud 区域与 Apple ID 不匹配，请切换区域后重新登录",
  [ICLOUD_SYNC_ERROR_CODES.DELETE_FAILED]: "从 iCloud 移除失败，请稍后重试",
  [ICLOUD_SYNC_ERROR_CODES.TASK_ACTIVE]: "已有任务进行中，请先取消后再操作"
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

/**
 * 将单文件任务的 lastError 转为表格可读备注
 * @note 优先匹配机读错误码；CDN/超时等常见模式单独简化
 */
export function formatAssetTaskError(raw: string | null | undefined): string {
  if (!raw?.trim()) return "—";
  const trimmed = raw.trim();
  const code = trimmed.split(":")[0]?.trim() ?? trimmed;
  if (ERROR_USER_MESSAGES[code]) {
    return ERROR_USER_MESSAGES[code];
  }
  const lower = trimmed.toLowerCase();
  if (lower.includes("410") || lower.includes("404")) {
    return "CDN 链接失效（已自动重试）";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "下载超时";
  }
  if (trimmed.length > 72) {
    return `${trimmed.slice(0, 72)}…`;
  }
  return trimmed;
}

/** 开始同步前校验：相册根目录、落盘路径、登录与 consent */
export async function validateIcloudSyncReady(): Promise<{ ok: true } | { ok: false; message: string }> {
  const [albumRoot, settings, auth] = await Promise.all([getAlbumRootForDefault(), getIcloudSyncSettings(), getIcloudSyncAuthState()]);
  if (!albumRoot.trim()) {
    return { ok: false, message: "请先在应用设置中配置相册根目录" };
  }
  const output = settings.outputDir.trim() || buildDefaultOutputDir(albumRoot);
  if (!output.trim()) {
    return { ok: false, message: "请配置 iCloud 同步落盘目录" };
  }
  if (!auth.loggedIn) {
    return { ok: false, message: "请先登录 Apple ID" };
  }
  if (!auth.consentReady) {
    return { ok: false, message: "请完成 iCloud 同步授权确认（登录弹窗内勾选）" };
  }
  return { ok: true };
}

/** 读取本机 iCloud 同步设置 */
export function getIcloudSyncSettings() {
  return invoke<IcloudSyncSettings>("icloud_sync_get_settings");
}

/** 保存本机 iCloud 同步设置（不含密码） */
export function saveIcloudSyncSettings(settings: IcloudSyncSettings) {
  return invoke<void>("icloud_sync_save_settings", { settings });
}

/**
 * 保存 Apple ID 与密码（密码进 keyring，不进 settings.json）
 * @returns 是否变更了 Apple ID（换号时会清 sidecar 与旧 session）
 */
export function setIcloudSyncCredentials(appleId: string, password: string) {
  return invoke<boolean>("icloud_sync_set_credentials", { appleId, password });
}

/** 登出：清 sidecar 内存态与当前账号 session；保留 settings 中的 Apple ID */
export function logoutIcloudSync(clearSession = true) {
  return invoke<void>("icloud_sync_logout", { clearSession });
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

/** 新建同步任务：catalog → diff → 入队 → 下载（固定 full 模式） */
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

/** 列出失败资产摘要，供同步页失败表格 */
export function listIcloudSyncFailedAssets(jobId: number, limit = 50) {
  return invoke<IcloudSyncFailedAssetRow[]>("icloud_sync_list_failed_assets", { jobId, limit });
}

/** 分页列出任务下全部文件行 */
export function listIcloudSyncAssetTasks(
  jobId: number,
  options: { offset?: number; limit?: number; status?: IcloudSyncAssetTaskFilter; keyword?: string } = {}
) {
  return invoke<IcloudSyncListAssetTasksResult>("icloud_sync_list_asset_tasks", {
    jobId,
    offset: options.offset ?? 0,
    limit: options.limit ?? 50,
    status: options.status ?? "all",
    keyword: options.keyword?.trim() || null
  });
}

/** 丢弃未完成任务（同步 / 删云 / 刷新 catalog） */
export function discardIcloudSyncJob(jobId: number) {
  return invoke<void>("icloud_sync_discard_job", { jobId });
}

/** 当前账号未完成任务（hydrate 用） */
export function getIcloudSyncActiveTask() {
  return invoke<IcloudSyncJobStatusResult | null>("icloud_sync_active_task");
}

/** 仅刷新 iCloud 目录统计，不下载；与同步/删云互斥 */
export function refreshIcloudSyncCatalog(view: IcloudSyncJobView = "library") {
  return invoke<IcloudSyncStartJobResult>("icloud_sync_refresh_catalog", { view });
}

/** 分页加载跨 job 云资产列表（抽屉主列表；Live 在应用层合并展示） */
export function loadIcloudSyncAssets(
  options: {
    offset?: number;
    limit?: number;
    cloudState?: IcloudSyncCloudStateFilter;
    /** YYYY-MM-DD，按 sortKey 前缀筛选拍摄/加入时间 */
    dateFrom?: string;
    dateTo?: string;
  } = {}
) {
  return invoke<IcloudSyncLoadAssetsResult>("icloud_sync_load_assets", {
    offset: options.offset ?? 0,
    limit: options.limit ?? 50,
    cloudState: options.cloudState && options.cloudState !== "all" ? options.cloudState : null,
    dateFrom: options.dateFrom?.trim() || null,
    dateTo: options.dateTo?.trim() || null
  });
}

/** 抽屉列表：合并 Live 行 + 展示用 rowKey；raw 中 mov 行兜底并入 liveMovFilename */
export async function loadIcloudSyncCloudList(options: Parameters<typeof loadIcloudSyncAssets>[0] = {}) {
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

/** cloud_state 汇总 */
export function getIcloudSyncCloudStateSummary() {
  return invoke<IcloudSyncCloudStateSummary>("icloud_sync_get_cloud_state_summary");
}

/** 批量删云入队（Modal 确认后调用；Live still 会自动带上 mov） */
export function deleteIcloudSyncAssets(items: IcloudSyncDeleteAssetItem[], reason = "user_batch") {
  return invoke<IcloudSyncDeleteAssetsResult>("icloud_sync_delete_assets", {
    items: items.map(item => ({ assetId: item.assetId, part: item.part })),
    reason
  });
}

/** 已同步全部入队删云（跨页；仍校验本地文件） */
export function deleteAllSyncedIcloudAssets(reason = "user_all_synced") {
  return invoke<IcloudSyncDeleteAssetsResult>("icloud_sync_delete_all_synced", { reason });
}

/** 撤销 pending 云删 */
export function cancelIcloudSyncCloudDelete(items: IcloudSyncDeleteAssetItem[]) {
  return invoke<IcloudSyncCancelCloudDeleteResult>("icloud_sync_cancel_cloud_delete", {
    items: items.map(item => ({ assetId: item.assetId, part: item.part }))
  });
}

/** 将 failed_delete 重新入队 */
export function retryIcloudSyncCloudDeletes() {
  return invoke<IcloudSyncRetryCloudDeletesResult>("icloud_sync_retry_cloud_deletes");
}

/** 删除本地文件及 media.db 索引（不触碰 iCloud sync） */
export function deleteAlbumLocal(paths: string[]) {
  return invoke<number>("album_delete_local", { paths });
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
