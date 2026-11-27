/**
 * 云同步删云进度（抽屉底栏）
 * 职责：订阅进度事件、执行 deleteFn、收成底栏只读结果态
 * 适用：icloudSync / qzoneSync 批量移除；确认弹窗仍在页面层
 */

import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { createSharedComposable } from "@vueuse/core";
import {
  keepIdsFromCloudSyncDelete,
  summarizeCloudSyncDelete,
  type CloudSyncDeleteNormalizedResult,
  type CloudSyncDeleteProgress,
  type CloudSyncDeleteSummary
} from "./cloudSyncDelete";

export type CloudSyncDeleteRunnerPhase = "idle" | "running" | "done";

export type CloudSyncDeleteRunOptions = {
  progressEvent: string;
  items: { assetId: string }[];
  deleteFn: (items: { assetId: string }[]) => Promise<CloudSyncDeleteNormalizedResult>;
  formatError?: (e: unknown) => string;
  isAuthFailure?: (e: unknown) => boolean;
  onAuthFailure?: (e: unknown) => void | Promise<void>;
  warnOnNoDeletable?: boolean;
  /** 连接阶段 total=0 时底栏描述 */
  connectingTip: string;
  /** 进行中底栏标题 */
  runningHeadline?: string;
};

function _useCloudSyncDeleteRunner() {
  const phase = ref<CloudSyncDeleteRunnerPhase>("idle");
  const progress = ref<CloudSyncDeleteProgress>({ processed: 0, total: 0 });
  const summary = ref<CloudSyncDeleteSummary | null>(null);
  const connectingTip = ref("正在连接…");
  const runningHeadline = ref("正在移除…");

  const isRunning = computed(() => phase.value === "running");
  const showFooter = computed(() => phase.value === "running" || phase.value === "done");

  const percent = computed(() => {
    const { processed, total } = progress.value;
    return total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  });

  const statusHeadline = computed(() => {
    if (phase.value === "running") return runningHeadline.value;
    if (summary.value) return summary.value.title;
    return "移除完成";
  });

  const statusDescription = computed(() => {
    if (phase.value === "running") {
      const { processed, total } = progress.value;
      return total > 0 ? `已处理 ${processed} / ${total} 项` : connectingTip.value;
    }
    if (summary.value?.lines.length) return summary.value.lines.join("；");
    return "";
  });

  const isFailedFooter = computed(() => summary.value?.status === "error");

  let lastOnFinished: ((keepAssetIds: string[]) => void) | null = null;

  function reset() {
    phase.value = "idle";
    progress.value = { processed: 0, total: 0 };
    summary.value = null;
    lastOnFinished = null;
  }

  /**
   * 确认后启动删云；结束后保留 done 底栏直至页面 reset（通常关抽屉）
   */
  async function start(options: CloudSyncDeleteRunOptions, onFinished: (keepAssetIds: string[]) => void) {
    if (phase.value === "running") return;
    phase.value = "running";
    progress.value = { processed: 0, total: 0 };
    summary.value = null;
    connectingTip.value = options.connectingTip;
    runningHeadline.value = options.runningHeadline ?? "正在移除…";
    lastOnFinished = onFinished;

    const items = [...options.items];
    const ids = items.map(i => i.assetId);
    const formatError = options.formatError ?? ((e: unknown) => (e instanceof Error ? e.message : String(e) || "移除失败"));

    let unlisten: UnlistenFn | null = null;
    try {
      unlisten = await listen<CloudSyncDeleteProgress>(options.progressEvent, event => {
        if (event.payload) progress.value = event.payload;
      });
      const res = await options.deleteFn(items);
      summary.value = summarizeCloudSyncDelete(res, "", { warnOnNoDeletable: options.warnOnNoDeletable });
      phase.value = "done";
      onFinished(keepIdsFromCloudSyncDelete(res, ids));
    } catch (e) {
      if (options.isAuthFailure?.(e)) {
        phase.value = "idle";
        onFinished(keepIdsFromCloudSyncDelete(null, ids));
        reset();
        if (options.onAuthFailure) await options.onAuthFailure(e);
        return;
      }
      const err = formatError(e);
      summary.value = summarizeCloudSyncDelete(null, err, { warnOnNoDeletable: options.warnOnNoDeletable });
      phase.value = "done";
      onFinished(keepIdsFromCloudSyncDelete(null, ids));
    } finally {
      unlisten?.();
    }
  }

  return {
    phase,
    progress,
    summary,
    isRunning,
    showFooter,
    percent,
    statusHeadline,
    statusDescription,
    isFailedFooter,
    start,
    reset
  };
}

/** iCloud / QQ 各一枚单例（同屏双 FAB 并存时互不串态） */
export const useIcloudCloudDeleteRunner = createSharedComposable(_useCloudSyncDeleteRunner);
export const useQzoneCloudDeleteRunner = createSharedComposable(_useCloudSyncDeleteRunner);