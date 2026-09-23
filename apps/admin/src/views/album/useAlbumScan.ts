/**
 * 相册磁盘扫描与进度
 * 职责：scan 重入排队、album_scan invoke、进度事件写回、缩略图就绪写回 pathIndex
 * 适用：album/index.vue；年份窗口重置由调用方 onScanComplete 接线
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ComputedRef, Ref } from "vue";
import $feedback from "@/utils/feedback";
import {
  ALBUM_SCAN_PROGRESS_EVENT,
  ALBUM_THUMB_READY_EVENT,
  type AlbumScanProgressPayload,
  type AlbumThumbReadyPayload,
  type MediaFile,
  type MediaGroup
} from "./types";

export interface UseAlbumScanOptions {
  rootDir: Ref<string>;
  groups: Ref<MediaGroup[]>;
  /** path → groups 内 MediaFile；缩略图就绪事件 O(1) 写回 */
  pathIndex: Ref<Map<string, MediaFile>> | ComputedRef<Map<string, MediaFile>>;
  /** 扫描成功写入 groups 后回调（如重置年份窗口） */
  onScanComplete: () => void;
}

/**
 * 相册扫描状态机与 Tauri 进度监听
 * @param options rootDir / groups / pathIndex / onScanComplete
 */
export function useAlbumScan(options: UseAlbumScanOptions) {
  const { rootDir, groups, pathIndex, onScanComplete } = options;

  const loading = ref(false);
  const error = ref("");
  const scanProgress = ref<AlbumScanProgressPayload>({ phase: "discover", done: 0, total: 0 });
  /** 每次 scan 最多 toast 一次预览失败汇总，避免刷屏 */
  let previewFailWarned = false;

  /**
   * 缩略图阶段收尾：有失败则一条 warning（格内已是占位，不逐张打断）
   */
  function maybeWarnPreviewFailures(payload: AlbumScanProgressPayload) {
    if (payload.phase !== "thumbnails") return;
    const failed = payload.failed ?? 0;
    if (failed <= 0 || previewFailWarned) return;
    if (payload.total <= 0 || payload.done < payload.total) return;
    previewFailWarned = true;
    $feedback.message.warning(`有 ${failed} 张照片预览生成失败，已用占位显示`);
  }

  const scanProgressPercent = computed(() => {
    const { phase, done, total } = scanProgress.value;
    if ((phase === "thumbnails" || phase === "live-proxy") && total > 0) {
      return Math.min(100, Math.round((done / total) * 100));
    }
    if (phase === "discover" && scanProgress.value.total > 0) {
      return 100;
    }
    return 0;
  });

  const scanProgressLabel = computed(() => {
    const { phase, done, total } = scanProgress.value;
    if (phase === "live-proxy" && total > 0) {
      return `组装实况文件 ${done} / ${total}`;
    }
    if (phase === "thumbnails" && total > 0) {
      return `加载文件 ${done} / ${total}`;
    }
    if (done > 0) {
      return `扫描文件 ${done}${total > 0 ? ` / ${total}` : ""}`;
    }
    return "扫描中...";
  });

  const thumbsGenerating = computed(
    () => (scanProgress.value.phase === "thumbnails" || scanProgress.value.phase === "live-proxy") && scanProgress.value.total > scanProgress.value.done
  );

  /** 全页 loading 进度条：仅缩略图生成等慢过程；discover / live-proxy 不挡宫格 */
  const showFullPageScanProgress = computed(() => scanProgress.value.phase === "thumbnails" && scanProgress.value.total > 0);

  function applyThumbReady(payload: AlbumThumbReadyPayload) {
    const file = pathIndex.value.get(payload.path);
    if (!file) return;
    if (payload.thumbPath) file.thumbPath = payload.thumbPath;
    if (payload.previewPath) file.previewPath = payload.previewPath;
    if (payload.playbackPath) file.playbackPath = payload.playbackPath;
    // 元数据只补空：缩略图解码宽高优先于后续 EXIF 事件
    if (payload.captureAt) file.captureAt ??= payload.captureAt;
    if (payload.captureAtSource) file.captureAtSource ??= payload.captureAtSource;
    if (payload.captureAtProbed != null) file.captureAtProbed = payload.captureAtProbed;
    if (payload.camera) file.camera ??= payload.camera;
    if (payload.width) file.width ??= payload.width;
    if (payload.height) file.height ??= payload.height;
  }

  // scan 重入保护：进行中只排队一次，结束后再扫
  // force=true 跳过 dirty 走全量 WalkDir（用户点刷新/重试时）
  // force=false 走 dirty 决策，cache_hit 时秒返 DB 列表
  let scanPromise: Promise<void> | null = null;
  let scanQueued = false;
  let scanQueuedForce = false;

  /**
   * 触发扫描；进行中则合并排队（force 取并）
   * @param force true 强制全量 WalkDir
   */
  function scan(force = false) {
    if (scanPromise) {
      scanQueued = true;
      scanQueuedForce = scanQueuedForce || force;
      return scanPromise;
    }
    scanQueuedForce = force;
    const nextForce = scanQueuedForce;
    scanQueuedForce = false;
    scanPromise = doScan(nextForce).finally(() => {
      scanPromise = null;
      if (scanQueued) {
        scanQueued = false;
        const qf = scanQueuedForce;
        scanQueuedForce = false;
        void scan(qf);
      }
    });
    return scanPromise;
  }

  async function doScan(force: boolean) {
    if (!rootDir.value) return;
    loading.value = true;
    error.value = "";
    groups.value = [];
    previewFailWarned = false;
    scanProgress.value = { phase: "discover", done: 0, total: 0 };
    try {
      const result = await invoke<MediaGroup[]>("album_scan", {
        root: rootDir.value,
        force
      });
      groups.value = result;
      onScanComplete();
    } catch (e: unknown) {
      error.value = typeof e === "string" ? e : "扫描失败";
    } finally {
      loading.value = false;
    }
  }

  let unlistenScanProgress: UnlistenFn | undefined;
  let unlistenThumbReady: UnlistenFn | undefined;

  /**
   * 注册扫描进度与缩略图就绪事件；返回卸载函数
   */
  async function bindScanListeners(): Promise<() => void> {
    try {
      unlistenScanProgress = await listen<AlbumScanProgressPayload>(ALBUM_SCAN_PROGRESS_EVENT, event => {
        if (event.payload) {
          scanProgress.value = event.payload;
          maybeWarnPreviewFailures(event.payload);
        }
      });

      unlistenThumbReady = await listen<AlbumThumbReadyPayload>(ALBUM_THUMB_READY_EVENT, event => {
        if (event.payload) {
          applyThumbReady(event.payload);
        }
      });
    } catch (e) {
      console.error("Failed to register album event listeners:", e);
    }
    return () => {
      unlistenScanProgress?.();
      unlistenThumbReady?.();
      unlistenScanProgress = undefined;
      unlistenThumbReady = undefined;
    };
  }

  /** 取消进行中的扫描（页面卸载时） */
  function cancelScan() {
    invoke("album_cancel_scan").catch(() => undefined);
  }

  return {
    loading,
    error,
    scanProgress,
    scanProgressPercent,
    scanProgressLabel,
    thumbsGenerating,
    showFullPageScanProgress,
    scan,
    bindScanListeners,
    cancelScan
  };
}
