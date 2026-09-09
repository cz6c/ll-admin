/**
 * iCloud 统一任务状态
 * 职责：同步 / 删云 / 刷新 catalog 单任务模型；主按钮「同步到本地」串联刷新+下载
 * 适用：IcloudSyncFab · IcloudSyncStatusCard · IcloudSyncAuthPanel（登录后回调）
 */

import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import { listen } from "@tauri-apps/api/event";
import { createSharedComposable } from "@vueuse/core";
import {
  discardIcloudSyncJob,
  formatIcloudSyncError,
  getIcloudSyncActiveTask,
  getIcloudSyncAuthState,
  getIcloudSyncJobStatus,
  getIcloudSyncSettings,
  ICLOUD_SYNC_ACTIVE_JOB_KEY,
  ICLOUD_SYNC_CLOUD_STATE_CHANGED_EVENT,
  ICLOUD_SYNC_JOB_STATUS_EVENT,
  ICLOUD_SYNC_PROGRESS_EVENT,
  logoutIcloudSync,
  pauseIcloudSyncJob,
  refreshIcloudSyncCatalog,
  resumeIcloudSyncJob,
  startIcloudSyncJob,
  validateIcloudSyncReady,
  type IcloudSyncJobStatus,
  type IcloudSyncJobStatusResult,
  type IcloudSyncProgressPayload,
  type IcloudSyncTaskType
} from "@/api/icloudSync";
import $feedback from "@/utils/feedback";
import { isTauri } from "@/utils/tauri";

dayjs.extend(duration);

export type IcloudSyncPrimaryActionKind = "primary" | "default" | "danger";

/** 同步页主按钮定义（单按钮交互） */
export interface IcloudSyncPrimaryAction {
  label: string;
  kind: IcloudSyncPrimaryActionKind;
  loading: boolean;
  disabled: boolean;
  handler: () => void | Promise<void>;
  /** 悬停提示（如主按钮说明） */
  tip?: string;
}

/** 「同步到本地」主路径 tip：UI 自动串联刷新 + 入队下载 */
const SYNC_TO_LOCAL_TIP = "将先更新 iCloud 状态，再把待同步项同步到本地";

function maskAppleId(raw: string): string {
  const id = raw.trim();
  if (!id) return "未登录";
  if (!id.includes("@")) return id;
  const [local, domain] = id.split("@");
  const head = local.length <= 6 ? (local[0] ?? "") : local.slice(0, 6);
  return `${head}***@${domain}`;
}

function _useIcloudSyncJob() {
  const isLoggedIn = ref(false);
  const currentAppleId = ref("");
  const starting = ref(false);
  const pausing = ref(false);
  const resuming = ref(false);
  const discarding = ref(false);

  const activeJobId = ref<number | null>(null);
  const taskType = ref<IcloudSyncTaskType | null>(null);
  const jobStatus = ref<IcloudSyncJobStatus | null>(null);
  const jobAppleId = ref("");
  const outputDir = ref("");
  /** 当前任务失败摘要（来自 status.errorMessage）；用于说明与轻提示 */
  const jobErrorMessage = ref("");
  /** 已对某 jobId 弹过失败 toast，避免 status 重复事件刷屏 */
  let toastedFailJobId: number | null = null;
  const progress = ref<IcloudSyncProgressPayload>({ done: 0, total: 0, failed: 0, pending: 0, filename: "" });
  const refreshingCatalog = ref(false);
  /**
   * catalog 完成后自动入队下载（仅「同步到本地」主路径置位；
   * 「仅更新状态」不得置位，避免误下载）
   */
  let pendingAutoStartAfterCatalog = false;

  const catalogStartedAt = ref<number | null>(null);
  const downloadStartedAt = ref<number | null>(null);
  const nowTick = ref(Date.now());

  /** session 失效续传门禁 */
  const sessionReauthReady = ref(false);

  let catalogTimer: ReturnType<typeof setInterval> | undefined;
  let listenersBound = false;
  let unlistenProgress: (() => void) | undefined;
  let unlistenJobStatus: (() => void) | undefined;
  let unlistenCloudState: (() => void) | undefined;
  /** FAB 抽屉订阅 cloud-state-changed 时递增，供外部 watch 刷新列表 */
  const cloudStateTick = ref(0);
  /** 下载 progress 事件计数；抽屉云列表节流刷新 download_status */
  const downloadProgressTick = ref(0);

  const maskedCurrentAppleId = computed(() => maskAppleId(currentAppleId.value));

  const jobAccountMismatch = computed(() => {
    const jobId = jobAppleId.value.trim().toLowerCase();
    const current = currentAppleId.value.trim().toLowerCase();
    if (!jobId || !current) return false;
    return jobId !== current;
  });

  const isSyncTask = computed(() => taskType.value === "sync" || taskType.value === null);
  const isCloudDeleteTask = computed(() => taskType.value === "cloudDelete");
  const isCatalogTask = computed(() => taskType.value === "catalog");

  /**
   * 将 Rust/事件里的 taskType 归一为前端枚举
   * @note DB 存 cloud_delete；serde 事件为 cloudDelete — 两种都认，避免进度卡误判成同步
   */
  function normalizeTaskType(raw: unknown): IcloudSyncTaskType | null {
    if (raw === "cloudDelete" || raw === "cloud_delete") return "cloudDelete";
    if (raw === "sync" || raw === "catalog") return raw;
    return null;
  }

  const isCataloging = computed(() => jobStatus.value === "cataloging");
  const isPausedSession = computed(() => jobStatus.value === "paused_session");
  const isPausedUser = computed(() => jobStatus.value === "paused_user");
  const isPaused = computed(() => isPausedSession.value || isPausedUser.value);
  const showSessionExpiredAlert = computed(() => isPausedSession.value && !sessionReauthReady.value);
  const canResume = computed(() => {
    if (jobAccountMismatch.value || resuming.value || !isPaused.value) return false;
    if (isPausedSession.value) return sessionReauthReady.value;
    return isPausedUser.value;
  });
  const isRunning = computed(() => jobStatus.value === "running" || starting.value || resuming.value || isCataloging.value);
  /** 仅 worker 已在 running 时可暂停；starting 准备阶段尚无 job，不可暂停 */
  const canPause = computed(() => {
    if (pausing.value || jobStatus.value !== "running") return false;
    return isSyncTask.value || isCloudDeleteTask.value;
  });
  const isDone = computed(() => jobStatus.value === "done");
  const isFailed = computed(() => jobStatus.value === "failed");
  const hasActiveJob = computed(() => activeJobId.value != null && jobStatus.value != null);
  /** 任意类型未完成任务；所有入口互斥 */
  const hasIncompleteTask = computed(() => {
    if (!hasActiveJob.value) return false;
    return !isDone.value && !isFailed.value;
  });
  const canManageCloudSpace = computed(() => !hasIncompleteTask.value);
  const canCancelJob = computed(() => hasIncompleteTask.value && !isCataloging.value && !discarding.value);
  const showEmptyGuide = computed(() => !hasActiveJob.value && !isRunning.value);
  /** 仅同步下载显示进度条；删云由浮层展示；catalog 扫描只用文案 */
  const showProgressBar = computed(() => {
    if (!hasActiveJob.value || isCataloging.value || isCatalogTask.value) return false;
    if (!isSyncTask.value) return false;
    return progress.value.total > 0;
  });

  const progressPercent = computed(() => {
    if (!progress.value.total) return 0;
    return Math.min(100, Math.round((progress.value.done / progress.value.total) * 100));
  });

  const catalogElapsedText = computed(() => {
    if (!isCataloging.value || catalogStartedAt.value == null) return "—";
    const ms = nowTick.value - catalogStartedAt.value;
    const d = dayjs.duration(ms);
    const mins = Math.floor(d.asMinutes());
    const secs = d.seconds();
    if (mins > 0) return `${mins} 分 ${secs} 秒`;
    return `${secs} 秒`;
  });

  const etaText = computed(() => {
    if (jobStatus.value !== "running" || progress.value.total <= 0 || progress.value.done <= 0) return "";
    if (downloadStartedAt.value == null) return "";
    const elapsedMs = nowTick.value - downloadStartedAt.value;
    if (elapsedMs < 5000) return "";
    const rate = progress.value.done / elapsedMs;
    if (rate <= 0) return "";
    const remainMs = (progress.value.total - progress.value.done) / rate;
    const d = dayjs.duration(remainMs);
    const hrs = Math.floor(d.asHours());
    const mins = d.minutes();
    if (hrs > 0) return `约 ${hrs} 小时 ${mins} 分钟`;
    if (mins > 0) return `约 ${mins} 分钟`;
    return "约 1 分钟内";
  });

  const jobStatusLabel = computed(() => {
    const map: Record<IcloudSyncJobStatus, string> = {
      cataloging: "扫描图库",
      pending: "待同步",
      running: "同步中",
      paused_session: "已暂停（登录失效）",
      paused_user: "已暂停",
      done: "已完成",
      failed: "已失败"
    };
    return jobStatus.value ? map[jobStatus.value] : "—";
  });

  const statusHeadline = computed(() => {
    if (jobAccountMismatch.value) return "任务与当前账号不一致";
    if (showSessionExpiredAlert.value) {
      if (isCloudDeleteTask.value) return "移除已暂停（登录失效）";
      return "同步已暂停（登录失效）";
    }
    if (isDone.value) {
      if (isCloudDeleteTask.value) return "移除已完成";
      if (isCatalogTask.value) return "iCloud 目录已刷新";
      return "同步已完成";
    }
    if (isFailed.value) {
      if (isCloudDeleteTask.value) return "移除失败";
      if (isCatalogTask.value) return "刷新 iCloud 目录失败";
      return "同步失败";
    }
    if (isCataloging.value) {
      if (isCatalogTask.value) return "正在刷新 iCloud 目录…";
      return "正在扫描 iCloud 图库…";
    }
    if (isPausedUser.value) {
      if (isCloudDeleteTask.value) return "移除已暂停";
      return "同步已暂停";
    }
    if (jobStatus.value === "running") {
      if (isCloudDeleteTask.value) return "正在从 iCloud 移除…";
      return "正在同步";
    }
    // starting 早于 jobStatus 落盘：避免标题短暂落到 jobStatusLabel 的「—」
    if (starting.value) {
      if (isCloudDeleteTask.value) return "正在准备移除…";
      return "正在准备同步…";
    }
    if (resuming.value) {
      if (isCloudDeleteTask.value) return "正在继续移除…";
      return "正在继续同步…";
    }
    if (showEmptyGuide.value && !isLoggedIn.value) return "登录后即可同步";
    // 空闲：标题不重复按钮文案；说明只补一句分栏指引
    if (showEmptyGuide.value) return "准备就绪";
    return jobStatusLabel.value;
  });

  const statusDescription = computed(() => {
    if (jobAccountMismatch.value) {
      return `本地任务属于 ${maskAppleId(jobAppleId.value)}，当前登录 ${maskedCurrentAppleId.value}。请取消任务或开始新同步。`;
    }
    if (showSessionExpiredAlert.value) {
      if (isCloudDeleteTask.value) return "登录状态已失效，请重新登录后继续从 iCloud 移除。";
      return "登录状态已失效，已完成文件的进度已保留。请先重新登录后再继续同步。";
    }
    if (isFailed.value && jobErrorMessage.value) {
      return formatIcloudSyncError(jobErrorMessage.value);
    }
    if (isCataloging.value && isCatalogTask.value) {
      // starting=true 表示「同步到本地」串联路径，catalog 后会自动下载
      const suffix = starting.value ? "完成后将自动开始下载。" : "";
      return `正在对比 iCloud 图库与本地注册表；已用时 ${catalogElapsedText.value}。${suffix}`;
    }
    if (isCataloging.value) {
      return `正在扫描 iCloud 图库；已扫描 ${catalogElapsedText.value}。`;
    }
    if (isDone.value && isCloudDeleteTask.value) {
      return "iCloud 副本已移除，本地文件保留。";
    }
    if (isDone.value && isSyncTask.value && outputDir.value) {
      return "照片已在本地。有新增时再点「同步到本地」；也可勾选已同步项从 iCloud 移除。";
    }
    if (showEmptyGuide.value && isLoggedIn.value) {
      return "可勾选已同步项，或使用「移除全部已同步」从 iCloud 移除副本";
    }
    if (showEmptyGuide.value) {
      return "";
    }
    if (jobStatus.value === "running" && progress.value.filename) {
      const prefix = isCloudDeleteTask.value ? "当前移除" : "当前";
      return `${prefix}：${progress.value.filename}${etaText.value && isSyncTask.value ? ` · 预计剩余 ${etaText.value}` : ""}`;
    }
    if (jobStatus.value === "running" && progress.value.total > 0) {
      const p = progress.value;
      return `进度 ${p.done}/${p.total}${p.failed > 0 ? ` · 失败 ${p.failed}` : ""}`;
    }
    return "";
  });

  /** FAB 浮动触发区派生状态：图标/颜色/标签/进度/呼吸动效 */
  const fabState = computed(() => {
    if (!isLoggedIn.value) {
      return { icon: "cloud" as const, color: "default" as const, label: "登录", percent: 0, breathing: false };
    }
    if (isCataloging.value) {
      const label = isCatalogTask.value ? "刷新中" : "扫描中";
      return { icon: "cloud" as const, color: "processing" as const, label, percent: 0, breathing: true };
    }
    if (isRunning.value) {
      const label = isCloudDeleteTask.value ? `${progressPercent.value}%` : `${progressPercent.value}%`;
      return { icon: "cloud" as const, color: "processing" as const, label, percent: progressPercent.value, breathing: false };
    }
    if (isPaused.value) {
      return { icon: "pause" as const, color: "warning" as const, label: "已暂停", percent: progressPercent.value, breathing: false };
    }
    if (isFailed.value) {
      return {
        icon: "warning" as const,
        color: "error" as const,
        label: progress.value.failed > 0 ? `失败 ${progress.value.failed}` : "失败",
        percent: 0,
        breathing: false
      };
    }
    if (isDone.value && isCloudDeleteTask.value) {
      return { icon: "check" as const, color: "success" as const, label: "已移除", percent: 100, breathing: false };
    }
    if (isDone.value) {
      return { icon: "check" as const, color: "success" as const, label: `${progress.value.done} 张`, percent: 100, breathing: false };
    }
    return { icon: "cloud" as const, color: "default" as const, label: "同步", percent: 0, breathing: false };
  });

  function syncCatalogTimer() {
    if (isCataloging.value) {
      if (catalogStartedAt.value == null) catalogStartedAt.value = Date.now();
      if (!catalogTimer) {
        catalogTimer = setInterval(() => {
          nowTick.value = Date.now();
        }, 1000);
      }
    } else {
      catalogStartedAt.value = null;
      if (catalogTimer) {
        clearInterval(catalogTimer);
        catalogTimer = undefined;
      }
    }
  }

  /**
   * 仅刷新 settings 中的 Apple ID 展示（不 auth_probe）
   * @note 开抽屉用此入口；探活留给 hydrate / 登录变更 / 写操作前 ensure
   */
  async function refreshAccountSettings() {
    if (!isTauri()) return;
    try {
      const settings = await getIcloudSyncSettings();
      currentAppleId.value = settings.appleId?.trim() ?? "";
    } catch {
      /* 保留内存登录态与账号展示 */
    }
  }

  /**
   * 拉取 settings + auth_state（含 auth_probe）
   * @note 仅 hydrate、登录成功后、退出后再校验；勿在开抽屉热路径调用
   */
  async function loadAccountContext() {
    if (!isTauri()) return;
    try {
      const [settings, authState] = await Promise.all([getIcloudSyncSettings(), getIcloudSyncAuthState()]);
      currentAppleId.value = settings.appleId?.trim() ?? "";
      isLoggedIn.value = authState.loggedIn;
    } catch {
      currentAppleId.value = "";
      isLoggedIn.value = false;
    }
  }

  function storeJobId(jobId: number | null) {
    activeJobId.value = jobId;
    try {
      if (jobId == null) {
        localStorage.removeItem(ICLOUD_SYNC_ACTIVE_JOB_KEY);
      } else {
        localStorage.setItem(ICLOUD_SYNC_ACTIVE_JOB_KEY, String(jobId));
      }
    } catch {
      /* 存储不可用时仍保留内存态 */
    }
  }

  function clearActiveJob() {
    pendingAutoStartAfterCatalog = false;
    storeJobId(null);
    taskType.value = null;
    jobStatus.value = null;
    jobAppleId.value = "";
    outputDir.value = "";
    jobErrorMessage.value = "";
    toastedFailJobId = null;
    progress.value = { done: 0, total: 0, failed: 0, pending: 0, filename: "" };
    downloadStartedAt.value = null;
    syncCatalogTimer();
  }

  function applyJobStatus(status: IcloudSyncJobStatusResult) {
    if (activeJobId.value != null && status.jobId !== activeJobId.value) return;
    if (activeJobId.value == null) storeJobId(status.jobId);
    taskType.value = normalizeTaskType(status.taskType);
    jobAppleId.value = status.appleId ?? "";
    outputDir.value = status.outputDir ?? "";
    jobStatus.value = status.status;
    progress.value = {
      done: status.done,
      total: status.total,
      failed: status.failed ?? 0,
      pending: status.pending ?? 0,
      filename: progress.value.filename
    };
    const err = (status.errorMessage ?? "").trim();
    if (status.status === "failed") {
      if (err) {
        jobErrorMessage.value = err;
        // 同一失败任务只 toast 一次；有摘要才提示（避免空 failed 刷屏）
        if (toastedFailJobId !== status.jobId) {
          toastedFailJobId = status.jobId;
          $feedback.message.error(formatIcloudSyncError(err));
        }
      }
    } else {
      jobErrorMessage.value = "";
      toastedFailJobId = null;
    }
    if (status.status === "paused_session") {
      sessionReauthReady.value = false;
    }
    if (status.total > 0 && downloadStartedAt.value == null && status.status === "running") {
      downloadStartedAt.value = Date.now();
    }
    syncCatalogTimer();
    // 「同步到本地」：catalog 成功后自动入队下载；失败则结束串联
    if (pendingAutoStartAfterCatalog && status.taskType === "catalog") {
      if (status.status === "done") {
        pendingAutoStartAfterCatalog = false;
        void startDownloadAfterCatalog();
        return;
      }
      if (status.status === "failed") {
        pendingAutoStartAfterCatalog = false;
        starting.value = false;
      }
    }
    if (status.status === "done") {
      progress.value = { done: status.total, total: status.total, failed: 0, pending: 0, filename: "" };
      try {
        localStorage.removeItem(ICLOUD_SYNC_ACTIVE_JOB_KEY);
      } catch {
        /* 已完成任务不再持久化 */
      }
    }
  }

  async function refreshJobStatus(jobId: number) {
    const status = await getIcloudSyncJobStatus(jobId);
    applyJobStatus(status);
    return status;
  }

  /** 仅入队下载（不 catalog）；供串联路径与内部调用 */
  async function onStart() {
    starting.value = true;
    try {
      const check = await validateIcloudSyncReady();
      if (check.ok === false) {
        $feedback.message.error(check.message);
        return;
      }
      const result = await startIcloudSyncJob();
      storeJobId(result.jobId);
      taskType.value = "sync";
      jobStatus.value = "pending";
      catalogStartedAt.value = null;
      downloadStartedAt.value = Date.now();
      syncCatalogTimer();
      progress.value = { done: 0, total: 0, failed: 0, pending: 0, filename: "" };
      void refreshJobStatus(result.jobId);
    } catch (e) {
      $feedback.message.error(formatIcloudSyncError(e));
    } finally {
      starting.value = false;
    }
  }

  /**
   * catalog 成功后的入队下载；starting 已由 onSyncToLocal 置位，此处不再重复置位
   * @note 无 cloud_only 时 start_job 会报错，由 $feedback.message.error 轻提示
   */
  async function startDownloadAfterCatalog() {
    try {
      const check = await validateIcloudSyncReady();
      if (check.ok === false) {
        $feedback.message.error(check.message);
        return;
      }
      const result = await startIcloudSyncJob();
      storeJobId(result.jobId);
      taskType.value = "sync";
      jobStatus.value = "pending";
      catalogStartedAt.value = null;
      downloadStartedAt.value = Date.now();
      syncCatalogTimer();
      progress.value = { done: 0, total: 0, failed: 0, pending: 0, filename: "" };
      void refreshJobStatus(result.jobId);
    } catch (e) {
      $feedback.message.error(formatIcloudSyncError(e));
    } finally {
      starting.value = false;
    }
  }

  /**
   * 主路径「同步到本地」：先 catalog/diff，成功后再入队下载
   * @note 与「仅更新状态」(onRefreshCatalog) 分离，避免只刷新也触发下载
   */
  async function onSyncToLocal() {
    if (starting.value || refreshingCatalog.value || hasIncompleteTask.value) return;
    starting.value = true;
    try {
      const check = await validateIcloudSyncReady();
      if (check.ok === false) {
        $feedback.message.error(check.message);
        starting.value = false;
        return;
      }
      pendingAutoStartAfterCatalog = true;
      const result = await refreshIcloudSyncCatalog();
      storeJobId(result.jobId);
      taskType.value = "catalog";
      jobStatus.value = "cataloging";
      catalogStartedAt.value = Date.now();
      progress.value = { done: 0, total: 0, failed: 0, pending: 0, filename: "" };
      syncCatalogTimer();
      void refreshJobStatus(result.jobId);
      // starting 保持 true，直至 startDownloadAfterCatalog / catalog failed
    } catch (e) {
      pendingAutoStartAfterCatalog = false;
      $feedback.message.error(formatIcloudSyncError(e));
      starting.value = false;
    }
  }

  async function onPause() {
    const jobId = activeJobId.value;
    if (jobId == null) return;
    pausing.value = true;
    try {
      await pauseIcloudSyncJob(jobId);
      await refreshJobStatus(jobId);
    } catch (e) {
      $feedback.message.error(formatIcloudSyncError(e));
    } finally {
      pausing.value = false;
    }
  }

  async function onResume() {
    const jobId = activeJobId.value;
    if (jobId == null) return;
    resuming.value = true;
    try {
      await resumeIcloudSyncJob(jobId);
      await refreshJobStatus(jobId);
    } catch (e) {
      $feedback.message.error(formatIcloudSyncError(e));
    } finally {
      resuming.value = false;
    }
  }

  async function onDiscardAndRestart() {
    const jobId = activeJobId.value;
    discarding.value = true;
    try {
      if (jobId != null) {
        await discardIcloudSyncJob(jobId);
      }
      clearActiveJob();
      await onSyncToLocal();
    } catch (e) {
      $feedback.message.error(formatIcloudSyncError(e));
    } finally {
      discarding.value = false;
    }
  }

  /** 丢弃当前任务但不自动重新开始；已下载文件保留在磁盘 */
  async function onCancelJob() {
    const jobId = activeJobId.value;
    if (jobId == null) return;
    discarding.value = true;
    try {
      await discardIcloudSyncJob(jobId);
      clearActiveJob();
    } catch (e) {
      $feedback.message.error(formatIcloudSyncError(e));
    } finally {
      discarding.value = false;
    }
  }

  async function bindActiveTask(jobId: number) {
    storeJobId(jobId);
    await refreshJobStatus(jobId);
  }

  async function onRefreshCatalog() {
    refreshingCatalog.value = true;
    try {
      const result = await refreshIcloudSyncCatalog();
      storeJobId(result.jobId);
      taskType.value = "catalog";
      jobStatus.value = "cataloging";
      catalogStartedAt.value = Date.now();
      progress.value = { done: 0, total: 0, failed: 0, pending: 0, filename: "" };
      void refreshJobStatus(result.jobId);
    } catch (e) {
      $feedback.message.error(formatIcloudSyncError(e));
    } finally {
      refreshingCatalog.value = false;
    }
  }

  function confirmCancelJob() {
    const title = isCloudDeleteTask.value ? "取消移除任务？" : isCatalogTask.value ? "取消刷新 iCloud 目录？" : "取消同步任务？";
    const content = isCloudDeleteTask.value
      ? "将撤销尚未完成的 iCloud 移除队列；已移除的项不会恢复。"
      : isCatalogTask.value
        ? "将停止当前 iCloud 目录刷新；已有 cloud_state 统计会保留。"
        : "将丢弃当前任务的同步进度（已同步到本地的文件会保留）。之后可重新「同步到本地」。";
    void $feedback
      .confirm(content, {
        title,
        okText: "取消任务",
        cancelText: "返回"
      })
      .then(() => onCancelJob())
      .catch(() => {
        /* 用户取消 */
      });
  }

  /**
   * 主动退出登录前协作暂停下载 worker
   * @note 不 discard job：同号重登可 resume；会话失效由 Rust 置 paused_session
   */
  async function prepareSyncBeforeLogout() {
    const jobId = activeJobId.value;
    if (jobId == null) return;
    const status = jobStatus.value;
    if (status === "running" || status === "pending") {
      try {
        await pauseIcloudSyncJob(jobId);
        await refreshJobStatus(jobId);
      } catch {
        /* cataloging 或已暂停 */
      }
    }
  }

  /** 退出 Apple ID：先暂停运行中任务，再清 sidecar session；保留 SQLite 断点 */
  async function onLogoutAccount() {
    await prepareSyncBeforeLogout();
    await logoutIcloudSync(true);
    onLoggedOut();
  }

  /** 主按钮：登录 / 同步到本地 / 暂停 / 继续 / 重新开始 */
  const primaryAction = computed((): IcloudSyncPrimaryAction | null => {
    if (jobAccountMismatch.value) {
      return {
        label: "开始新同步",
        kind: "primary",
        loading: discarding.value || starting.value,
        disabled: discarding.value || starting.value,
        tip: SYNC_TO_LOCAL_TIP,
        handler: onDiscardAndRestart
      };
    }
    if (isDone.value) {
      return {
        label: "同步到本地",
        kind: "primary",
        loading: starting.value,
        disabled: starting.value || hasIncompleteTask.value,
        tip: SYNC_TO_LOCAL_TIP,
        handler: onSyncToLocal
      };
    }
    if (isFailed.value) {
      return {
        label: "重新开始",
        kind: "primary",
        loading: discarding.value || starting.value,
        disabled: discarding.value || starting.value,
        tip: SYNC_TO_LOCAL_TIP,
        handler: onDiscardAndRestart
      };
    }
    /** 续传/暂停请求进行中：固定主按钮文案，避免 running 切换时闪一下 */
    if (resuming.value) {
      return {
        label: "继续同步",
        kind: "primary",
        loading: true,
        disabled: true,
        handler: onResume
      };
    }
    if (pausing.value) {
      return {
        label: "暂停同步",
        kind: "danger",
        loading: true,
        disabled: true,
        handler: onPause
      };
    }
    if (canPause.value) {
      const pauseLabel = isCloudDeleteTask.value ? "暂停移除" : "暂停同步";
      return {
        label: pauseLabel,
        kind: "danger",
        loading: pausing.value,
        disabled: pausing.value,
        handler: onPause
      };
    }
    if (isPaused.value && activeJobId.value != null) {
      const resumeLabel = isCloudDeleteTask.value ? "继续移除" : isCatalogTask.value ? "继续" : "继续同步";
      return {
        label: resumeLabel,
        kind: "primary",
        loading: resuming.value,
        disabled: !canResume.value,
        handler: onResume
      };
    }
    // 准备中尚无 running：保留主按钮 loading，避免空白或误显「暂停」
    if (starting.value && jobStatus.value !== "running") {
      return {
        label: "同步到本地",
        kind: "primary",
        loading: true,
        disabled: true,
        tip: SYNC_TO_LOCAL_TIP,
        handler: onSyncToLocal
      };
    }
    if (isRunning.value || isCataloging.value) {
      return null;
    }
    if (!isLoggedIn.value) {
      // 未登录由抽屉内嵌 AuthPanel 承接，状态卡不展示登录入口
      return null;
    }
    return {
      label: "同步到本地",
      kind: "primary",
      loading: starting.value,
      disabled: starting.value,
      tip: SYNC_TO_LOCAL_TIP,
      handler: onSyncToLocal
    };
  });

  async function hydrateFromStorage() {
    if (!isTauri()) return;
    await loadAccountContext();
    await ensureListeners();
    try {
      const active = await getIcloudSyncActiveTask();
      if (active) {
        storeJobId(active.jobId);
        applyJobStatus(active);
        return;
      }
      clearActiveJob();
    } catch {
      clearActiveJob();
    }
  }

  async function ensureListeners() {
    if (listenersBound || !isTauri()) return;
    listenersBound = true;

    unlistenProgress = await listen<IcloudSyncProgressPayload>(ICLOUD_SYNC_PROGRESS_EVENT, event => {
      if (event.payload) {
        progress.value = event.payload;
        downloadProgressTick.value += 1;
        if (event.payload.total > 0 && downloadStartedAt.value == null) {
          downloadStartedAt.value = Date.now();
        }
      }
    });

    unlistenJobStatus = await listen<IcloudSyncJobStatusResult>(ICLOUD_SYNC_JOB_STATUS_EVENT, event => {
      if (event.payload) {
        applyJobStatus(event.payload);
      }
    });

    unlistenCloudState = await listen(ICLOUD_SYNC_CLOUD_STATE_CHANGED_EVENT, () => {
      cloudStateTick.value += 1;
    });
  }

  async function onLoggedIn(payload: { accountChanged: boolean }) {
    await loadAccountContext();
    if (payload.accountChanged) {
      const jobId = activeJobId.value;
      if (jobId != null) {
        try {
          await discardIcloudSyncJob(jobId);
        } catch {
          /* job 可能已不存在 */
        }
      }
      clearActiveJob();
      sessionReauthReady.value = false;
      return;
    }
    if (isPausedSession.value) {
      sessionReauthReady.value = true;
    }
  }

  function onLoggedOut() {
    sessionReauthReady.value = false;
    void loadAccountContext();
    clearActiveJob();
  }

  return {
    isLoggedIn,
    currentAppleId,
    maskedCurrentAppleId,
    starting,
    pausing,
    resuming,
    discarding,
    activeJobId,
    taskType,
    jobStatus,
    jobAppleId,
    outputDir,
    progress,
    sessionReauthReady,
    jobAccountMismatch,
    isCataloging,
    isPausedSession,
    isPausedUser,
    isPaused,
    showSessionExpiredAlert,
    canResume,
    isRunning,
    canPause,
    isDone,
    isFailed,
    hasActiveJob,
    hasIncompleteTask,
    canManageCloudSpace,
    canCancelJob,
    showEmptyGuide,
    showProgressBar,
    isSyncTask,
    isCloudDeleteTask,
    isCatalogTask,
    progressPercent,
    catalogElapsedText,
    etaText,
    jobStatusLabel,
    statusHeadline,
    statusDescription,
    fabState,
    cloudStateTick,
    downloadProgressTick,
    refreshingCatalog,
    bindActiveTask,
    onRefreshCatalog,
    clearActiveJob,
    onSyncToLocal,
    primaryAction,
    hydrateFromStorage,
    loadAccountContext,
    refreshAccountSettings,
    onStart,
    onPause,
    onResume,
    onDiscardAndRestart,
    confirmCancelJob,
    onLogoutAccount,
    onLoggedIn,
    onLoggedOut
  };
}

export const useIcloudSyncJob = createSharedComposable(_useIcloudSyncJob);
