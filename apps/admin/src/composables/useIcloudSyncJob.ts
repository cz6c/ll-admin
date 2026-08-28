/**
 * iCloud 同步任务共享状态
 * 职责：job 恢复、事件监听、主/次按钮（开始/暂停/继续/取消/重新开始）、登出协作暂停、FAB 状态
 * 适用：IcloudSyncFab · IcloudSyncStatusCard · IcloudSyncAuthModal（退出）
 */

import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import { listen } from "@tauri-apps/api/event";
import { createSharedComposable } from "@vueuse/core";
import {
  discardIcloudSyncJob,
  formatIcloudSyncError,
  getIcloudSyncAuthState,
  getIcloudSyncJobStatus,
  getIcloudSyncSettings,
  ICLOUD_SYNC_ACTIVE_JOB_KEY,
  ICLOUD_SYNC_CLOUD_STATE_CHANGED_EVENT,
  ICLOUD_SYNC_JOB_STATUS_EVENT,
  ICLOUD_SYNC_PROGRESS_EVENT,
  logoutIcloudSync,
  pauseIcloudSyncJob,
  resumeIcloudSyncJob,
  startIcloudSyncJob,
  validateIcloudSyncReady,
  type IcloudSyncJobStatus,
  type IcloudSyncJobStatusResult,
  type IcloudSyncProgressPayload
} from "@/api/icloudSync";
import { Modal } from "ant-design-vue";
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
}

function maskAppleId(raw: string): string {
  const id = raw.trim();
  if (!id) return "未登录";
  if (!id.includes("@")) return id;
  const [local, domain] = id.split("@");
  const head = local.length <= 2 ? (local[0] ?? "") : local.slice(0, 2);
  return `${head}***@${domain}`;
}

function readStoredJobId(): number | null {
  try {
    const raw = localStorage.getItem(ICLOUD_SYNC_ACTIVE_JOB_KEY);
    if (!raw) return null;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function _useIcloudSyncJob() {
  const isLoggedIn = ref(false);
  const currentAppleId = ref("");
  const starting = ref(false);
  const pausing = ref(false);
  const resuming = ref(false);
  const discarding = ref(false);
  const errorMsg = ref("");
  const authModalOpen = ref(false);

  const activeJobId = ref<number | null>(null);
  const jobStatus = ref<IcloudSyncJobStatus | null>(null);
  const jobAppleId = ref("");
  const outputDir = ref("");
  const progress = ref<IcloudSyncProgressPayload>({ done: 0, total: 0, failed: 0, pending: 0, filename: "" });

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
  const canPause = computed(() => jobStatus.value === "running" && !pausing.value);
  const isDone = computed(() => jobStatus.value === "done");
  const isFailed = computed(() => jobStatus.value === "failed");
  const hasActiveJob = computed(() => activeJobId.value != null && jobStatus.value != null);
  /** 未完成 job（含 pending/paused）；删云腾空间须等其结束或已失败/完成 */
  const hasIncompleteJob = computed(() => {
    if (!hasActiveJob.value) return false;
    return !isDone.value && !isFailed.value;
  });
  /** 云删等会干扰 worker 的操作；与 hasIncompleteJob 互斥 */
  const canManageCloudSpace = computed(() => !hasIncompleteJob.value);
  /** 可丢弃的未完成任务（扫描中不可取消，须等 catalog 结束） */
  const canCancelJob = computed(() => hasIncompleteJob.value && !isCataloging.value && !discarding.value);
  const showEmptyGuide = computed(() => !hasActiveJob.value && !isRunning.value);

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
      pending: "待下载",
      running: "下载中",
      paused_session: "已暂停（登录失效）",
      paused_user: "已暂停",
      done: "已完成",
      failed: "已失败"
    };
    return jobStatus.value ? map[jobStatus.value] : "—";
  });

  const statusHeadline = computed(() => {
    if (jobAccountMismatch.value) return "任务与当前账号不一致";
    if (showSessionExpiredAlert.value) return "同步已暂停（登录失效）";
    if (isDone.value) return "同步已完成";
    if (isFailed.value) return "同步失败";
    if (isCataloging.value) return "正在扫描 iCloud 图库…";
    if (isPausedUser.value) return "同步已暂停";
    if (jobStatus.value === "running") return "正在下载";
    if (showEmptyGuide.value && !isLoggedIn.value) return "登录后即可开始同步";
    if (showEmptyGuide.value) return "准备就绪，可开始同步";
    return jobStatusLabel.value;
  });

  const statusDescription = computed(() => {
    if (jobAccountMismatch.value) {
      return `本地任务属于 ${maskAppleId(jobAppleId.value)}，当前登录 ${maskedCurrentAppleId.value}。请开始新同步。`;
    }
    if (showSessionExpiredAlert.value) {
      return "登录状态已失效，已完成文件的进度已保留。请先重新登录后再继续同步。";
    }
    if (isCataloging.value) {
      return `正在扫描 iCloud 图库；已扫描 ${catalogElapsedText.value}，完成后自动开始下载。`;
    }
    if (isDone.value && outputDir.value) {
      return `照片已在本地。可再次「开始同步」拉取新增或尚未下载的照片；也可从 iCloud 移除副本以释放空间。文件夹：${outputDir.value}`;
    }
    if (showEmptyGuide.value) {
      return "流程：登录 Apple ID → 点击开始同步。";
    }
    if (jobStatus.value === "running" && progress.value.filename) {
      return `当前：${progress.value.filename}${etaText.value ? ` · 预计剩余 ${etaText.value}` : ""}`;
    }
    return "";
  });

  /** FAB 浮动触发区派生状态：图标/颜色/标签/进度/呼吸动效 */
  const fabState = computed(() => {
    if (!isLoggedIn.value) {
      return { icon: "cloud" as const, color: "default" as const, label: "登录", percent: 0, breathing: false };
    }
    if (isCataloging.value) {
      return { icon: "cloud" as const, color: "processing" as const, label: "扫描中", percent: 0, breathing: true };
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
    storeJobId(null);
    jobStatus.value = null;
    jobAppleId.value = "";
    outputDir.value = "";
    progress.value = { done: 0, total: 0, failed: 0, pending: 0, filename: "" };
    downloadStartedAt.value = null;
    syncCatalogTimer();
  }

  function applyJobStatus(status: IcloudSyncJobStatusResult) {
    if (activeJobId.value != null && status.jobId !== activeJobId.value) return;
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
    if (status.status === "paused_session") {
      sessionReauthReady.value = false;
    }
    if (status.total > 0 && downloadStartedAt.value == null && status.status === "running") {
      downloadStartedAt.value = Date.now();
    }
    syncCatalogTimer();
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

  async function onStart() {
    starting.value = true;
    errorMsg.value = "";
    try {
      const check = await validateIcloudSyncReady();
      if (check.ok === false) {
        errorMsg.value = check.message;
        return;
      }
      const result = await startIcloudSyncJob();
      storeJobId(result.jobId);
      jobStatus.value = "cataloging";
      catalogStartedAt.value = Date.now();
      downloadStartedAt.value = null;
      syncCatalogTimer();
      progress.value = { done: 0, total: 0, failed: 0, pending: 0, filename: "" };
      void refreshJobStatus(result.jobId);
    } catch (e) {
      errorMsg.value = formatIcloudSyncError(e);
    } finally {
      starting.value = false;
    }
  }

  async function onPause() {
    const jobId = activeJobId.value;
    if (jobId == null) return;
    pausing.value = true;
    errorMsg.value = "";
    try {
      await pauseIcloudSyncJob(jobId);
      await refreshJobStatus(jobId);
    } catch (e) {
      errorMsg.value = formatIcloudSyncError(e);
    } finally {
      pausing.value = false;
    }
  }

  async function onResume() {
    const jobId = activeJobId.value;
    if (jobId == null) return;
    resuming.value = true;
    errorMsg.value = "";
    try {
      await resumeIcloudSyncJob(jobId);
      await refreshJobStatus(jobId);
    } catch (e) {
      errorMsg.value = formatIcloudSyncError(e);
    } finally {
      resuming.value = false;
    }
  }

  async function onDiscardAndRestart() {
    const jobId = activeJobId.value;
    discarding.value = true;
    errorMsg.value = "";
    try {
      if (jobId != null) {
        await discardIcloudSyncJob(jobId);
      }
      clearActiveJob();
      await onStart();
    } catch (e) {
      errorMsg.value = formatIcloudSyncError(e);
    } finally {
      discarding.value = false;
    }
  }

  /** 丢弃当前任务但不自动重新开始；已下载文件保留在磁盘 */
  async function onCancelJob() {
    const jobId = activeJobId.value;
    if (jobId == null) return;
    discarding.value = true;
    errorMsg.value = "";
    try {
      await discardIcloudSyncJob(jobId);
      clearActiveJob();
    } catch (e) {
      errorMsg.value = formatIcloudSyncError(e);
    } finally {
      discarding.value = false;
    }
  }

  function confirmCancelJob() {
    Modal.confirm({
      title: "取消同步任务？",
      content: "将丢弃当前任务的下载进度（已下载到本地的文件会保留）。之后可重新「开始同步」。",
      okText: "取消任务",
      okType: "danger",
      cancelText: "返回",
      onOk: () => onCancelJob()
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

  /** 主按钮：登录 / 开始 / 暂停 / 继续 / 重新开始 */
  const primaryAction = computed((): IcloudSyncPrimaryAction | null => {
    if (jobAccountMismatch.value) {
      return {
        label: "开始新同步",
        kind: "primary",
        loading: discarding.value || starting.value,
        disabled: discarding.value || starting.value,
        handler: onDiscardAndRestart
      };
    }
    if (isDone.value) {
      return {
        label: "开始同步",
        kind: "primary",
        loading: starting.value,
        disabled: starting.value,
        handler: onStart
      };
    }
    if (isFailed.value) {
      return {
        label: "重新开始",
        kind: "primary",
        loading: discarding.value || starting.value,
        disabled: discarding.value || starting.value,
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
      return {
        label: "暂停同步",
        kind: "danger",
        loading: pausing.value,
        disabled: pausing.value,
        handler: onPause
      };
    }
    if (isPaused.value && activeJobId.value != null) {
      return {
        label: "继续同步",
        kind: "primary",
        loading: resuming.value,
        disabled: !canResume.value,
        handler: onResume
      };
    }
    if (isRunning.value) {
      return null;
    }
    if (!isLoggedIn.value) {
      return {
        label: "登录 Apple ID",
        kind: "primary",
        loading: false,
        disabled: false,
        handler: () => {
          authModalOpen.value = true;
        }
      };
    }
    return {
      label: "开始同步",
      kind: "primary",
      loading: starting.value,
      disabled: starting.value,
      handler: onStart
    };
  });

  async function hydrateFromStorage() {
    if (!isTauri()) return;
    await loadAccountContext();
    await ensureListeners();
    const jobId = readStoredJobId();
    if (jobId == null) return;
    activeJobId.value = jobId;
    try {
      const status = await refreshJobStatus(jobId);
      if (currentAppleId.value.trim() && status.appleId.trim().toLowerCase() !== currentAppleId.value.trim().toLowerCase()) {
        /* 保留 job 供用户选择「开始新同步」，不清除 */
      }
    } catch {
      storeJobId(null);
      jobStatus.value = null;
      jobAppleId.value = "";
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
      errorMsg.value = "";
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
  }

  return {
    isLoggedIn,
    currentAppleId,
    maskedCurrentAppleId,
    starting,
    pausing,
    resuming,
    discarding,
    errorMsg,
    authModalOpen,
    activeJobId,
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
    hasIncompleteJob,
    canManageCloudSpace,
    canCancelJob,
    showEmptyGuide,
    progressPercent,
    catalogElapsedText,
    etaText,
    jobStatusLabel,
    statusHeadline,
    statusDescription,
    fabState,
    cloudStateTick,
    downloadProgressTick,
    primaryAction,
    hydrateFromStorage,
    loadAccountContext,
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
