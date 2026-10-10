/**
 * 云同步抽屉意图先行（下载 / 移除）
 * 职责：互斥进入、退出清勾选、批量按钮文案；忙时护栏由调用方 canManage 注入
 * 适用：IcloudSyncFab / QzoneSyncFab
 */
import type { ComputedRef, Ref } from "vue";
import $feedback from "@/utils/feedback";

/** null=混排浏览；download/delete=筛态勾选 */
export type CloudSyncIntent = null | "download" | "delete";

const DEFAULT_BUSY_HINT = "有任务进行中，请取消或等待结束后再操作";

type MaybeCount = Ref<number> | ComputedRef<number>;
type MaybeBool = Ref<boolean> | ComputedRef<boolean>;

export interface UseCloudSyncIntentOptions {
  /** 无活跃任务时可改云空间（删云 / 刷新 / 进意图） */
  canManage: MaybeBool;
  /** 当前已勾数量，驱动按钮文案 */
  selectedCount: MaybeCount;
  /** 进意图或退出时清空勾选 */
  clearSelection: () => void;
  /** 进入意图后的副作用（如 iCloud 按筛态重拉列表） */
  onAfterEnter?: (next: "download" | "delete") => void;
  /** 退出意图后的副作用 */
  onAfterExit?: () => void;
  busyHint?: string;
}

/**
 * @returns 意图状态、文案、进退与忙时护栏
 */
export function useCloudSyncIntent(options: UseCloudSyncIntentOptions) {
  const intent = ref<CloudSyncIntent>(null);
  const selectMode = computed(() => intent.value != null);
  const busyHint = options.busyHint ?? DEFAULT_BUSY_HINT;

  const downloadIntentLabel = computed(() =>
    intent.value === "download" ? `批量下载 (${options.selectedCount.value})` : "批量下载"
  );
  const deleteIntentLabel = computed(() =>
    intent.value === "delete" ? `批量移除 (${options.selectedCount.value})` : "批量移除"
  );

  /** @returns 可继续操作时 true */
  function guardManageAction(): boolean {
    if (options.canManage.value) return true;
    $feedback.message.warning(busyHint);
    return false;
  }

  /**
   * 仅空闲可进；已在其它意图时须先取消
   * @returns 是否已处于/进入该意图
   */
  function enterIntent(next: "download" | "delete"): boolean {
    if (!guardManageAction()) return false;
    if (intent.value === next) return true;
    if (intent.value != null) return false;
    options.clearSelection();
    intent.value = next;
    options.onAfterEnter?.(next);
    return true;
  }

  function exitIntent() {
    intent.value = null;
    options.clearSelection();
    options.onAfterExit?.();
  }

  return {
    intent,
    selectMode,
    downloadIntentLabel,
    deleteIntentLabel,
    guardManageAction,
    enterIntent,
    exitIntent
  };
}
