/**
 * iCloud 同步后台提示（成功 / 告警）
 * 职责：监听 Rust job-status 事件；按 CS 统一门控在 OS / message / 页内之间分流
 * 适用：App.vue CS 模式挂载
 */

import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  getIcloudSyncJobStatus,
  ICLOUD_SYNC_ACTIVE_JOB_KEY,
  ICLOUD_SYNC_JOB_STATUS_EVENT,
  type IcloudSyncJobStatus,
  type IcloudSyncJobStatusResult
} from "@/api/icloudSync";
import { isTauri } from "@/utils/tauri";
import { deliverCsNotify, type CsNotifyKind, type CsNotifyPayload } from "@/utils/csSystemNotify";

/** 同步 UI 已合并进相册页；在该 path 时由页内 FAB/抽屉展示，不重复弹 message */
const ATTENTION_PATH = "/album/gallery";

/** 需要全局提示的任务终态（paused_user 为用户主动暂停，不提示） */
const NOTIFY_STATUSES: IcloudSyncJobStatus[] = ["paused_session", "failed", "done"];

/** 启动恢复时仅补发「需用户处理」的告警；done 成功已在当时通知过，避免每次启动重复弹 */
const RECOVER_NOTIFY_STATUSES: IcloudSyncJobStatus[] = ["paused_session", "failed"];

function clearStoredActiveJobId() {
  try {
    localStorage.removeItem(ICLOUD_SYNC_ACTIVE_JOB_KEY);
  } catch {
    /* 存储不可用忽略 */
  }
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

function notifyCopy(
  status: IcloudSyncJobStatus,
  detail: IcloudSyncJobStatusResult
): { payload: CsNotifyPayload; kind: CsNotifyKind } {
  if (status === "done") {
    return {
      kind: "success",
      payload: {
        title: "iCloud 同步已完成",
        body: `共 ${detail.total} 项已全部同步完成。`
      }
    };
  }
  if (status === "paused_session") {
    return {
      kind: "error",
      payload: {
        title: "iCloud 同步已暂停",
        body: `登录状态失效（${detail.done}/${detail.total} 已完成），请打开同步页重新登录后继续。`
      }
    };
  }
  return {
    kind: "error",
    payload: {
      title: "iCloud 同步失败",
      body: `任务异常结束（${detail.done}/${detail.total}），请打开同步页查看。`
    }
  };
}

/**
 * 挂载 iCloud 同步全局提示：job-status 事件 + 启动时一次性恢复
 */
export function useIcloudSyncBackgroundNotify() {
  const router = useRouter();
  let unlistenJobStatus: (() => void) | undefined;
  let lastNotifyKey = "";

  async function maybeNotify(status: IcloudSyncJobStatusResult, options?: { fromRecover?: boolean }) {
    const storedId = readStoredJobId();
    if (storedId == null || status.jobId !== storedId) return;

    if (status.status === "done") {
      clearStoredActiveJobId();
    }

    if (!NOTIFY_STATUSES.includes(status.status)) {
      if (status.status === "running" || status.status === "pending") {
        lastNotifyKey = "";
      }
      return;
    }

    if (options?.fromRecover && !RECOVER_NOTIFY_STATUSES.includes(status.status)) {
      return;
    }

    const notifyKey = `${status.jobId}:${status.status}`;
    if (lastNotifyKey === notifyKey) return;

    const focused = await getCurrentWindow().isFocused();
    const currentPath = router.currentRoute.value.path;
    const { payload, kind } = notifyCopy(status.status, status);
    await deliverCsNotify(
      { windowFocused: focused, currentPath, attentionPath: ATTENTION_PATH },
      payload,
      kind
    );
    lastNotifyKey = notifyKey;

    if (status.status === "done") {
      clearStoredActiveJobId();
    }
  }

  /** 启动时补拉一次：仅补发 paused_session / failed；done 只清 localStorage 不通知 */
  async function recoverFromStorage() {
    const jobId = readStoredJobId();
    if (jobId == null) return;
    try {
      const status = await getIcloudSyncJobStatus(jobId);
      await maybeNotify(status, { fromRecover: true });
    } catch {
      clearStoredActiveJobId();
    }
  }

  onMounted(async () => {
    if (!isTauri()) return;
    await recoverFromStorage();

    unlistenJobStatus = await listen<IcloudSyncJobStatusResult>(ICLOUD_SYNC_JOB_STATUS_EVENT, event => {
      if (event.payload) {
        void maybeNotify(event.payload);
      }
    });
  });

  onBeforeUnmount(() => {
    unlistenJobStatus?.();
  });
}

/** @deprecated 使用 useIcloudSyncBackgroundNotify */
export const useIcloudSyncBackgroundAlert = useIcloudSyncBackgroundNotify;
