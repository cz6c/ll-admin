/**
 * iCloud 统一任务状态
 * 职责：批量下载 / 删云 / 刷新 catalog 单任务模型；下载仅走勾选子集入队
 * 适用：IcloudSyncFab · IcloudSyncFooter · IcloudSyncAuthPanel（登录后回调）
 * @note 业务层会话失效（含 need_2fa）：完整 logout 回登录面板；不在业务页承接输码
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
  isIcloudSessionAuthFailure,
  getIcloudSyncCloudStateSummary,
  logoutIcloudSync,
  refreshIcloudSyncCatalog,
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

/**
 * 进程级事件订阅（勿放进 createSharedComposable 可销毁闭包）
 * @note 共享 composable 无订阅者时会 dispose；listen 不卸 + 闭包内标志重置 → remount 叠多个回调，
 *       同一 failed / paused_session 会重复 toast、重复强制 logout
 * @note 回调经 active* 指针转发到当前实例，remount 只换指针、不再 listen
 */
let jobListenersBound = false;
let activeApplyJobStatus: ((status: IcloudSyncJobStatusResult) => void) | null = null;
let activeOnProgress: ((payload: IcloudSyncProgressPayload) => void) | null = null;
let activeOnCloudStateChanged: (() => void) | null = null;

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

  const activeJobId = ref<number | null>(null);
  const taskType = ref<IcloudSyncTaskType | null>(null);
  const jobStatus = ref<IcloudSyncJobStatus | null>(null);
  const jobAppleId = ref("");
  const outputDir = ref("");
  /** 当前任务失败摘要（来自 status.errorMessage）；用于说明与轻提示 */
  const jobErrorMessage = ref("");
  /** 已对某 jobId 弹过失败 toast，避免 status 重复事件刷屏 */
  let toastedFailJobId: number | null = null;
  /** paused_session 已触发过强制重登，避免事件重复刷 logout */
  let forcedLogoutForPausedJobId: number | null = null;
  /** 强制重登进行中（防并发） */
  let forcingSessionLogout = false;
  const progress = ref<IcloudSyncProgressPayload>({ done: 0, total: 0, failed: 0, pending: 0, filename: "" });
  const refreshingCatalog = ref(false);

  const catalogStartedAt = ref<number | null>(null);
  const downloadStartedAt = ref<number | null>(null);
  const nowTick = ref(Date.now());

  /** session 失效续传门禁 */
  const sessionReauthReady = ref(false);

  let catalogTimer: ReturnType<typeof setInterval> | undefined;
  /** FAB 抽屉订阅 cloud-state-changed 时递增，供外部 watch 刷新列表 */
  const cloudStateTick = ref(0);
  /** 抽屉内完成登录后须强制 catalog 一次（无视本地缓存） */
  let catalogRefreshAfterLogin = false;
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
  const isCatalogTask = computed(() => taskType.value === "catalog");

  /** 将 Rust/事件里的 taskType 归一为前端枚举（删云不入 job） */
  function normalizeTaskType(raw: unknown): IcloudSyncTaskType | null {
    if (raw === "sync" || raw === "catalog") return raw;
    return null;
  }

  const isCataloging = computed(() => jobStatus.value === "cataloging");
  const isPausedSession = computed(() => jobStatus.value === "paused_session");
  const isPausedUser = computed(() => jobStatus.value === "paused_user");
  const isPaused = computed(() => isPausedSession.value || isPausedUser.value);
  const showSessionExpiredAlert = computed(() => isPausedSession.value && !sessionReauthReady.value);
  const isRunning = computed(() => jobStatus.value === "running" || starting.value || isCataloging.value);
  const isDone = computed(() => jobStatus.value === "done");
  const isFailed = computed(() => jobStatus.value === "failed");
  const hasActiveJob = computed(() => activeJobId.value != null && jobStatus.value != null);
  /** 任意类型未完成任务；所有入口互斥 */
  const hasIncompleteTask = computed(() => {
    if (!hasActiveJob.value) return false;
    return !isDone.value && !isFailed.value;
  });
  const canManageCloudSpace = computed(() => !hasIncompleteTask.value);
  const showEmptyGuide = computed(() => !hasActiveJob.value && !isRunning.value);
  /** 仅下载任务显示进度条；删云由 toast 展示；catalog 扫描只用文案 */
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
      cataloging: "正在刷新…",
      pending: "待下载",
      running: "下载中",
      paused_session: "已暂停（需重新登录）",
      paused_user: "已暂停",
      done: "已完成",
      failed: "失败"
    };
    return jobStatus.value ? map[jobStatus.value] : "—";
  });

  const statusHeadline = computed(() => {
    if (jobAccountMismatch.value) return "任务与当前账号不一致";
    if (showSessionExpiredAlert.value) {
      return "已暂停（需重新登录）";
    }
    if (isDone.value) {
      if (isCatalogTask.value) return "刷新完成";
      const p = progress.value;
      if (p.failed > 0) return "下载完成（部分失败）";
      return "下载完成";
    }
    if (isFailed.value) {
      return "失败";
    }
    if (isCataloging.value) {
      return "正在刷新…";
    }
    if (isPausedUser.value) {
      return "已暂停";
    }
    if (jobStatus.value === "running") {
      return "下载中";
    }
    // starting 早于 jobStatus 落盘：避免标题短暂落到 jobStatusLabel 的「—」
    if (starting.value) {
      return "待下载";
    }
    if (showEmptyGuide.value && !isLoggedIn.value) return "登录后即可下载";
    if (showEmptyGuide.value) return "准备就绪";
    return jobStatusLabel.value;
  });

  const statusDescription = computed(() => {
    if (jobAccountMismatch.value) {
      return `本地任务属于 ${maskAppleId(jobAppleId.value)}，当前登录 ${maskedCurrentAppleId.value}。请关闭抽屉后换号或等待任务结束。`;
    }
    if (showSessionExpiredAlert.value) {
      return "登录状态已失效，已完成文件的进度已保留。请先重新登录后再继续下载。";
    }
    if (isFailed.value && jobErrorMessage.value) {
      return formatIcloudSyncError(jobErrorMessage.value);
    }
    if (isCataloging.value && isCatalogTask.value) {
      // starting=true 表示「下载到本地」串联路径，catalog 后会自动下载
      const suffix = starting.value ? "完成后将自动开始下载。" : "";
      return `正在对比 iCloud 图库与本地注册表；已用时 ${catalogElapsedText.value}。${suffix}`;
    }
    if (isCataloging.value) {
      return `正在扫描 iCloud 图库；已扫描 ${catalogElapsedText.value}。`;
    }
    if (isDone.value && isSyncTask.value) {
      const p = progress.value;
      const parts: string[] = [];
      if (p.total > 0) {
        const ok = Math.max(0, p.done - p.failed);
        parts.push(`共 ${p.total} 项，成功 ${ok} 项`);
      }
      if (p.failed > 0) parts.push(`失败 ${p.failed} 项`);
      if (outputDir.value) parts.push(`保存至 ${outputDir.value}`);
      return parts.join("；") || "可关闭抽屉继续浏览";
    }
    if (showEmptyGuide.value && isLoggedIn.value) {
      return "";
    }
    if (showEmptyGuide.value) {
      return "";
    }
    if (jobStatus.value === "running" && progress.value.filename) {
      return `当前：${progress.value.filename}${etaText.value && isSyncTask.value ? ` · 预计剩余 ${etaText.value}` : ""}`;
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
      return { icon: "cloud" as const, color: "processing" as const, label: `${progressPercent.value}%`, percent: progressPercent.value, breathing: false };
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
    if (isDone.value) {
      return { icon: "check" as const, color: "success" as const, label: `${progress.value.done} 张`, percent: 100, breathing: false };
    }
    return { icon: "cloud" as const, color: "default" as const, label: "下载", percent: 0, breathing: false };
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
   * 拉取 settings + 落盘登录态（不 auth_probe，避免重启时误清 session）
   * @note 开抽屉仍走 refreshAccountSettings；写操作前 ensure 才探活
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

  /**
   * 业务层会话不可用：完整 logout（清盘）并露出登录面板。
   * @note 不 clearActiveJob——paused_session 断点保留，同号重登后可 resume
   * @note 业务页无 2FA 输码 UI；need_2fa 也只能走完整重登
   */
  async function forceReloginAfterSessionFailure() {
    if (!isTauri() || forcingSessionLogout) return;
    forcingSessionLogout = true;
    try {
      await logoutIcloudSync(true);
      sessionReauthReady.value = false;
      await loadAccountContext();
      $feedback.message.warning("登录状态已失效，请重新登录后再继续");
    } catch (e) {
      isLoggedIn.value = false;
      sessionReauthReady.value = false;
      $feedback.message.error(formatIcloudSyncError(e));
    } finally {
      forcingSessionLogout = false;
    }
  }

  /**
   * 业务操作失败：会话类错误强制回登录面板，其它走 error toast
   */
  async function reportBusinessError(e: unknown) {
    if (isIcloudSessionAuthFailure(e)) {
      await forceReloginAfterSessionFailure();
      return;
    }
    $feedback.message.error(formatIcloudSyncError(e));
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
    storeJobId(null);
    taskType.value = null;
    jobStatus.value = null;
    jobAppleId.value = "";
    outputDir.value = "";
    jobErrorMessage.value = "";
    toastedFailJobId = null;
    forcedLogoutForPausedJobId = null;
    progress.value = { done: 0, total: 0, failed: 0, pending: 0, filename: "" };
    downloadStartedAt.value = null;
    syncCatalogTimer();
  }

  /**
   * 开关已开且库内也无 shared 登记：轻提示（不拦截刷新/下载）
   * @note SharedSync 常在 private zones；参与者账号 API 也可能列不出
   */
  async function tipSharedLibraryEmptyIfNeeded() {
    try {
      const settings = await getIcloudSyncSettings();
      if (!settings.syncSharedLibrary) return;
      const summary = await getIcloudSyncCloudStateSummary();
      if ((summary.sharedScopeTotal ?? 0) > 0) return;
      $feedback.message.info(
        "已开启「同步共享图库」，但本次 catalog 未枚举到 SharedSync 项。若为参与者账号，Apple API 可能列不出；库内历史登记已保留，可稍后再刷新。"
      );
    } catch {
      /* 诊断失败不挡主路径 */
    }
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
      // 下载中会话死：清伪登录并露出 AuthPanel（业务层无输码入口）
      if (forcedLogoutForPausedJobId !== status.jobId) {
        forcedLogoutForPausedJobId = status.jobId;
        void forceReloginAfterSessionFailure();
      }
    } else if (forcedLogoutForPausedJobId === status.jobId) {
      forcedLogoutForPausedJobId = null;
    }
    if (status.total > 0 && downloadStartedAt.value == null && status.status === "running") {
      downloadStartedAt.value = Date.now();
    }
    syncCatalogTimer();
    if (status.status === "done") {
      progress.value = {
        done: status.done,
        total: status.total,
        failed: status.failed ?? 0,
        pending: 0,
        filename: ""
      };
      if (status.taskType === "catalog") {
        void tipSharedLibraryEmptyIfNeeded();
      }
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

  /**
   * 意图先行：勾选子集入队下载（不 re-catalog）
   * @returns 是否成功启动任务
   */
  async function onStartSelected(assetIds: string[]): Promise<boolean> {
    if (starting.value || refreshingCatalog.value || hasIncompleteTask.value) return false;
    if (assetIds.length === 0) return false;
    starting.value = true;
    try {
      const check = await validateIcloudSyncReady();
      if (check.ok === false) {
        $feedback.message.error(check.message);
        return false;
      }
      const result = await startIcloudSyncJob("library", assetIds);
      storeJobId(result.jobId);
      taskType.value = "sync";
      jobStatus.value = "pending";
      catalogStartedAt.value = null;
      downloadStartedAt.value = Date.now();
      syncCatalogTimer();
      progress.value = { done: 0, total: 0, failed: 0, pending: 0, filename: "" };
      void refreshJobStatus(result.jobId);
      return true;
    } catch (e) {
      await reportBusinessError(e);
      return false;
    } finally {
      starting.value = false;
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
      await reportBusinessError(e);
    } finally {
      refreshingCatalog.value = false;
    }
  }

  /** 退出 Apple ID：清 sidecar session；下载断点仍落库 */
  async function onLogoutAccount() {
    await logoutIcloudSync(true);
    onLoggedOut();
  }

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
    if (!isTauri()) return;

    activeApplyJobStatus = applyJobStatus;
    activeOnProgress = (payload: IcloudSyncProgressPayload) => {
      progress.value = payload;
      downloadProgressTick.value += 1;
      if (payload.total > 0 && downloadStartedAt.value == null) {
        downloadStartedAt.value = Date.now();
      }
    };
    activeOnCloudStateChanged = () => {
      cloudStateTick.value += 1;
    };

    if (jobListenersBound) return;
    jobListenersBound = true;

    // 进程级只注册一次：相册壳生命周期内不卸载
    await listen<IcloudSyncProgressPayload>(ICLOUD_SYNC_PROGRESS_EVENT, event => {
      if (event.payload) activeOnProgress?.(event.payload);
    });
    await listen<IcloudSyncJobStatusResult>(ICLOUD_SYNC_JOB_STATUS_EVENT, event => {
      if (event.payload) activeApplyJobStatus?.(event.payload);
    });
    await listen(ICLOUD_SYNC_CLOUD_STATE_CHANGED_EVENT, () => {
      activeOnCloudStateChanged?.();
    });
  }

  async function onLoggedIn(payload: { accountChanged: boolean }) {
    await loadAccountContext();
    catalogRefreshAfterLogin = true;
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

  /**
   * 消费「登录后须 catalog」标记（单次）
   * @returns true 表示本次应强制刷新目录，与 SQLite 是否有缓存无关
   */
  function takeCatalogRefreshAfterLogin(): boolean {
    if (!catalogRefreshAfterLogin) return false;
    catalogRefreshAfterLogin = false;
    return true;
  }

  function onLoggedOut() {
    sessionReauthReady.value = false;
    catalogRefreshAfterLogin = false;
    void loadAccountContext();
    clearActiveJob();
  }

  return {
    isLoggedIn,
    currentAppleId,
    maskedCurrentAppleId,
    starting,
    activeJobId,
    taskType,
    jobStatus,
    jobAppleId,
    outputDir,
    progress,
    /** 业务层会话失败：logout 回登录面板；其它错误 toast */
    reportBusinessError,
    sessionReauthReady,
    jobAccountMismatch,
    isCataloging,
    isPausedSession,
    isPausedUser,
    isPaused,
    showSessionExpiredAlert,
    isRunning,
    isDone,
    isFailed,
    hasActiveJob,
    hasIncompleteTask,
    canManageCloudSpace,
    showEmptyGuide,
    showProgressBar,
    isSyncTask,
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
    onStartSelected,
    hydrateFromStorage,
    loadAccountContext,
    refreshAccountSettings,
    onLogoutAccount,
    onLoggedIn,
    onLoggedOut,
    takeCatalogRefreshAfterLogin
  };
}

export const useIcloudSyncJob = createSharedComposable(_useIcloudSyncJob);
