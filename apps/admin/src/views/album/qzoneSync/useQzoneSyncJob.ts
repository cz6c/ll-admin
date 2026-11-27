/**
 * QQ 空间同步任务与 FAB 进度态
 * 职责：job 快照、启动同步、进度事件；底栏只读展示由 QzoneSyncFooter 负责
 * 适用：qzoneSync/index.vue
 */

import { getQzoneJobStatus, startQzoneSyncJob, type QzoneJobSnapshot } from "@/api/qzoneSync";
import { isTauri } from "@/utils/tauri";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface UseQzoneSyncJobOptions {
  /** progress 事件：上一 status 与当前 payload */
  onJobEvent?: (payload: QzoneJobSnapshot, previousStatus: QzoneJobSnapshot["status"]) => void;
}

/**
 * @returns QQ 同步 job 状态与 FAB 展示
 */
export function useQzoneSyncJob(options: UseQzoneSyncJobOptions = {}) {
  const job = ref<QzoneJobSnapshot>({
    status: "idle",
    done: 0,
    total: 0,
    message: "",
    updated: 0,
    skipped: 0,
    failed: 0
  });

  const starting = ref(false);

  const busy = computed(() => ["cataloging", "downloading", "paused"].includes(job.value.status));

  const percent = computed(() => {
    if (job.value.total <= 0) return 0;
    return Math.min(100, Math.round((job.value.done / job.value.total) * 100));
  });

  async function refreshJob() {
    job.value = await getQzoneJobStatus();
  }

  async function startSyncAll() {
    starting.value = true;
    try {
      job.value = await startQzoneSyncJob();
      return job.value;
    } finally {
      starting.value = false;
    }
  }

  async function startSyncAlbum(albumId: string) {
    starting.value = true;
    try {
      job.value = await startQzoneSyncJob({ albumId });
      return job.value;
    } finally {
      starting.value = false;
    }
  }

  async function startSyncBatch(albumId: string, assetIds: string[]) {
    starting.value = true;
    try {
      job.value = await startQzoneSyncJob({ albumId, assetIds });
      return job.value;
    } finally {
      starting.value = false;
    }
  }

  function statusHeadlineForFab(status: string) {
    return status === "cataloging" ? "正在枚举相册…" : "正在下载到本地";
  }

  const fabState = computed(() => {
    const status = job.value.status;
    const p = percent.value;
    if (status === "downloading" || status === "cataloging") {
      return { icon: "cloud" as const, color: "processing" as const, label: statusHeadlineForFab(status), percent: p, breathing: false };
    }
    if (status === "paused") {
      return { icon: "pause" as const, color: "warning" as const, label: "已暂停", percent: p, breathing: false };
    }
    if (status === "failed") {
      return { icon: "warning" as const, color: "error" as const, label: "同步失败", percent: 0, breathing: false };
    }
    if (status === "done") {
      return { icon: "check" as const, color: "success" as const, label: "本轮已完成", percent: 100, breathing: false };
    }
    return { icon: "qq" as const, color: "default" as const, label: "QQ 空间同步", percent: 0, breathing: false };
  });

  const showFabProgress = computed(
    () => fabState.value.percent > 0 && fabState.value.percent < 100 && (job.value.status === "downloading" || job.value.status === "cataloging")
  );

  const fabIconName = computed(() => {
    switch (fabState.value.icon) {
      case "check":
        return "mdi:check-circle";
      case "warning":
        return "mdi:alert-circle";
      case "pause":
        return "mdi:pause-circle";
      case "cloud":
        return "mdi:cloud-outline";
      default:
        return "ri:qq-fill";
    }
  });

  let unlistenProgress: UnlistenFn | undefined;

  async function bindProgressListener() {
    if (!isTauri() || unlistenProgress) return;
    unlistenProgress = await listen<QzoneJobSnapshot>("qzone-sync://progress", ev => {
      const prev = job.value.status;
      job.value = ev.payload;
      options.onJobEvent?.(ev.payload, prev);
    });
  }

  function unbindProgressListener() {
    unlistenProgress?.();
    unlistenProgress = undefined;
  }

  async function hydrateJobFromTauri() {
    if (!isTauri()) return;
    await refreshJob();
    await bindProgressListener();
  }

  onBeforeUnmount(() => {
    unbindProgressListener();
  });

  return {
    job,
    busy,
    percent,
    starting,
    fabState,
    showFabProgress,
    fabIconName,
    refreshJob,
    startSyncAll,
    startSyncAlbum,
    startSyncBatch,
    hydrateJobFromTauri,
    unbindProgressListener
  };
}