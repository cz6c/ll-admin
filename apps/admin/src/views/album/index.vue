<!--
  相册主页 — 扁平时间线宫格（无目录树）
  职责：扫描根目录、根下全部媒体进一条时间线；文件名/拍摄日搜索；时间浮层；缩略图增量
  主流程：discover（sync 异物先收容进 pending，再索引含 pending）→ 扁平宫格 → 缩略图增量；可打开相册根目录
-->
<script setup lang="ts">
import IconifyIcon from "@/components/IconifyIcon/index.vue";
import { invoke } from "@tauri-apps/api/core";
import { Modal, message } from "ant-design-vue";
import { dateUtil } from "@llcz/common";
import type { Dayjs } from "dayjs";
import { deleteAlbumLocal, openAlbumDir } from "@/api/album";
import { isTauri } from "@/utils/tauri";
import { listen } from "@tauri-apps/api/event";
import { useElementSize, useScroll } from "@vueuse/core";
import AlbumThumbCard from "./components/AlbumThumbCard.vue";
import MediaViewer from "./components/MediaViewer.vue";
import IcloudSyncFab from "./components/IcloudSyncFab.vue";
import DuplicateCleanupModal from "./components/DuplicateCleanupModal.vue";
import { ALBUM_LAYOUT, computeAlbumGridLayout } from "./albumLayout";
import {
  ALBUM_SCAN_PROGRESS_EVENT,
  ALBUM_THUMB_GENERATE_SIZE,
  ALBUM_THUMB_READY_EVENT,
  type AlbumScanProgressPayload,
  type AlbumThumbReadyPayload,
  type MediaFile,
  type MediaGroup
} from "./types";

defineOptions({ name: "AlbumGallery" });

const router = useRouter();
/** CS 桌面端才支持 opener 打开本地目录 */
const inTauri = isTauri();

const groups = ref<MediaGroup[]>([]);
const rootDir = ref("");
const { gridGap: GAP, gridPadding: GRID_PADDING, bufferRows: BUFFER_ROWS } = ALBUM_LAYOUT;
const loading = ref(false);
const error = ref("");
const scanProgress = ref<AlbumScanProgressPayload>({ phase: "discover", done: 0, total: 0 });
const viewerState = ref<{ groupIdx: number; fileIdx: number } | null>(null);
const duplicateModalOpen = ref(false);
/** 全库：文件名模糊（大小写不敏感子串） */
const filenameKeyword = ref("");
/** 全库：拍摄日区间（含首含尾，按 captureAt 日比较） */
const captureDateRange = ref<[Dayjs, Dayjs] | null>(null);

/** path → groups 内 MediaFile 对象，缩略图就绪事件 O(1) 写回 */
const pathIndex = computed(() => {
  const map = new Map<string, MediaFile>();
  for (const g of groups.value) {
    for (const f of g.files) {
      map.set(f.path, f);
    }
  }
  return map;
});

/** 相册根下全部媒体（各目录 group 扁平合并） */
const allMediaFiles = computed<MediaFile[]>(() => groups.value.flatMap(g => g.files));

/**
 * 拍摄时间排序键：可解析 captureAt → unix 秒；否则 modified
 * 与 Rust `media_time_sort_key` 对齐，meta 补空后前端可再排
 */
function mediaTimeSortKey(file: MediaFile): number {
  const raw = file.captureAt?.trim();
  if (raw) {
    const d = dateUtil(raw);
    if (d.isValid()) return d.valueOf();
  }
  return (file.modified ?? 0) * 1000;
}

/** 文件名模糊 + 拍摄日区间（空 captureAt 不命中区间） */
function matchesLocalSearch(file: MediaFile): boolean {
  const kw = filenameKeyword.value.trim().toLowerCase();
  if (kw && !file.name.toLowerCase().includes(kw)) return false;
  const range = captureDateRange.value;
  if (range?.[0] && range?.[1]) {
    const cap = file.captureAt?.trim();
    if (!cap) return false;
    const day = dateUtil(cap);
    if (!day.isValid()) return false;
    const from = range[0].startOf("day");
    const to = range[1].endOf("day");
    if (day.isBefore(from) || day.isAfter(to)) return false;
  }
  return true;
}

/** 全库过滤 + 拍摄时间升序旧→新（供宫格 / Viewer / 时间浮层） */
const filteredFiles = computed<MediaFile[]>(() => {
  return [...allMediaFiles.value]
    .filter(matchesLocalSearch)
    .sort((a, b) => {
      const ta = mediaTimeSortKey(a);
      const tb = mediaTimeSortKey(b);
      if (ta !== tb) return ta - tb;
      return a.name.localeCompare(b.name);
    });
});

/** Viewer 单组「全部」，与宫格同一过滤结果，避免索引错位 */
const viewerGroups = computed<MediaGroup[]>(() => {
  if (filteredFiles.value.length === 0) return [];
  return [
    {
      dirName: "全部",
      dirPath: rootDir.value || ".",
      relPath: ".",
      files: filteredFiles.value
    }
  ];
});

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

/**
 * 在系统资源管理器中打开相册根目录（Rust 侧校验须在相册根下）
 */
async function openAlbumRootInExplorer() {
  if (!inTauri) {
    message.warning("仅桌面端可打开本地目录");
    return;
  }
  try {
    await openAlbumDir(".");
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e) || "打开目录失败");
  }
}

function applyThumbReady(payload: AlbumThumbReadyPayload) {
  const file = pathIndex.value.get(payload.path);
  if (!file) return;
  if (payload.thumbPath) file.thumbPath = payload.thumbPath;
  if (payload.previewPath) file.previewPath = payload.previewPath;
  if (payload.playbackPath) file.playbackPath = payload.playbackPath;
  // 元数据只补空：缩略图解码宽高优先于后续 EXIF 事件
  if (payload.captureAt) file.captureAt ??= payload.captureAt;
  if (payload.camera) file.camera ??= payload.camera;
  if (payload.width) file.width ??= payload.width;
  if (payload.height) file.height ??= payload.height;
}

async function loadSettings() {
  try {
    const settings = await invoke<{ rootDir: string }>("album_get_settings");
    rootDir.value = settings.rootDir || "";
  } catch (e) {
    console.error("Failed to load album settings:", e);
  }
}

// scan 重入保护：进行中只排队一次，结束后再扫
// force=true 跳过 dirty 走全量 WalkDir（用户点刷新/重试时）
// force=false 走 dirty 决策，cache_hit 时秒返 DB 列表
let scanPromise: Promise<void> | null = null;
let scanQueued = false;
let scanQueuedForce = false;
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
  scanProgress.value = { phase: "discover", done: 0, total: 0 };
  try {
    const result = await invoke<MediaGroup[]>("album_scan", {
      root: rootDir.value,
      thumbSize: ALBUM_THUMB_GENERATE_SIZE,
      force
    });
    groups.value = result;
    scrollAlbumToBottom();
  } catch (e: unknown) {
    error.value = typeof e === "string" ? e : "扫描失败";
  } finally {
    loading.value = false;
  }
}

function openViewer(file: MediaFile) {
  const fi = filteredFiles.value.findIndex(f => f.path === file.path);
  if (fi >= 0) {
    viewerState.value = { groupIdx: 0, fileIdx: fi };
  }
}

function onDuplicatesDeleted() {
  void scan(true);
}

/** 右键删除本地文件（不触碰 iCloud sync assets） */
function onDeleteLocal(file: MediaFile) {
  if (!isTauri()) return;
  Modal.confirm({
    title: "删除本地文件？",
    content: `将从磁盘删除「${file.name}」，不影响 iCloud 云端。`,
    okText: "删除",
    okType: "danger",
    cancelText: "取消",
    async onOk() {
      const paths = [file.path];
      if (file.videoPath?.trim()) paths.push(file.videoPath);
      await deleteAlbumLocal(paths);
      message.success("已删除本地文件");
      groups.value = groups.value.map(g => ({
        ...g,
        files: g.files.filter(f => f.path !== file.path)
      }));
    }
  });
}

// ===== 虚拟滚动：仅渲染可视区 + 上下缓冲的卡片，大相册不爆 DOM =====
const scrollEl = ref<HTMLElement | null>(null);
const { width: containerWidth, height: viewportHeight } = useElementSize(scrollEl);
const { y: scrollTop } = useScroll(scrollEl, { throttle: 60 });

/** scroll 内容区宽度 − 左右 padding（无侧栏，直接用实测宽） */
const gridAvailWidth = computed(() => Math.max(0, containerWidth.value - GRID_PADDING * 2));
const gridLayout = computed(() => computeAlbumGridLayout(gridAvailWidth.value));
const cols = computed(() => gridLayout.value.cols);
const thumbSize = computed(() => gridLayout.value.thumbSize);
const rowHeight = computed(() => gridLayout.value.rowHeight);
const allFiles = computed<MediaFile[]>(() => filteredFiles.value);
const totalRows = computed(() => Math.ceil(allFiles.value.length / cols.value));
const totalHeight = computed(() => totalRows.value * rowHeight.value);

const startRow = computed(() => Math.max(0, Math.floor(scrollTop.value / rowHeight.value) - BUFFER_ROWS));
const endRow = computed(() => Math.min(totalRows.value, Math.ceil((scrollTop.value + viewportHeight.value) / rowHeight.value) + BUFFER_ROWS));
const startIdx = computed(() => startRow.value * cols.value);
const endIdx = computed(() => endRow.value * cols.value);
const visibleFiles = computed<MediaFile[]>(() => allFiles.value.slice(startIdx.value, endIdx.value));

/**
 * 可视区首/末张拍摄日文案（不含 buffer）；无拍摄时间则「未知拍摄时间」
 */
function formatTimelineDay(file: MediaFile): string {
  const raw = file.captureAt?.trim();
  if (raw) {
    const d = dateUtil(raw);
    if (d.isValid()) return d.format("YYYY年MM月DD日");
  }
  return "未知拍摄时间";
}

/**
 * 时间浮层：可视区第一张 → 最后一张的拍摄日区间；同一天只显示一次
 */
const timelineLabel = computed(() => {
  const files = allFiles.value;
  if (files.length === 0 || viewportHeight.value <= 0 || cols.value <= 0 || rowHeight.value <= 0) {
    return "";
  }
  const firstVisibleRow = Math.min(totalRows.value - 1, Math.max(0, Math.floor(scrollTop.value / rowHeight.value)));
  const lastVisibleRow = Math.min(
    totalRows.value - 1,
    Math.max(0, Math.ceil((scrollTop.value + viewportHeight.value) / rowHeight.value) - 1)
  );
  const firstIdx = Math.min(files.length - 1, firstVisibleRow * cols.value);
  const lastIdx = Math.min(files.length - 1, (lastVisibleRow + 1) * cols.value - 1);
  const first = files[firstIdx];
  const last = files[lastIdx];
  if (!first || !last) return "";
  const from = formatTimelineDay(first);
  const to = formatTimelineDay(last);
  return from === to ? from : `${from} ～ ${to}`;
});

function cardStyle(idx: number): Record<string, string> {
  const col = idx % cols.value;
  const row = Math.floor(idx / cols.value);
  const cell = thumbSize.value + GAP;
  return {
    left: `${col * cell}px`,
    top: `${row * rowHeight.value}px`,
    width: `${thumbSize.value}px`,
    height: `${thumbSize.value}px`
  };
}

/**
 * 滚到宫格底部（最新一端）；双 rAF 等列宽/总高布局稳定后再钉一次
 * @note 扫描完成、搜索筛选后调用；虚拟窗口仍双向切片
 */
function scrollAlbumToBottom() {
  const apply = () => {
    const el = scrollEl.value;
    if (!el) return;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTop = max;
    scrollTop.value = max;
  };
  nextTick(() => {
    apply();
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(apply);
    });
  });
}

// 搜索条件变化滚底
watch([filenameKeyword, captureDateRange], () => {
  scrollAlbumToBottom();
});
/** 列表高度变化（列数/文件数）时若已在底部附近则继续钉底，避免首帧高度为 0 */
watch([totalHeight, viewportHeight], () => {
  const el = scrollEl.value;
  if (!el || totalHeight.value <= 0) return;
  const max = Math.max(0, el.scrollHeight - el.clientHeight);
  if (max - el.scrollTop <= rowHeight.value * 2) {
    scrollAlbumToBottom();
  }
});

let unlistenScanProgress: (() => void) | undefined;
let unlistenThumbReady: (() => void) | undefined;

onMounted(async () => {
  try {
    unlistenScanProgress = await listen<AlbumScanProgressPayload>(ALBUM_SCAN_PROGRESS_EVENT, event => {
      if (event.payload) {
        scanProgress.value = event.payload;
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

  await loadSettings();
  if (rootDir.value) {
    await scan();
  }
});

onBeforeUnmount(() => {
  unlistenScanProgress?.();
  unlistenThumbReady?.();
  invoke("album_cancel_scan").catch(() => undefined);
});
</script>

<template>
  <div class="album-page">
    <a-result v-if="!rootDir && !loading" status="info" title="未设置相册根目录" class="state-panel">
      <template #extra>
        <a-button type="primary" @click="router.push('/cs-settings')">前往设置</a-button>
      </template>
    </a-result>

    <div v-else-if="loading" class="state-panel state-loading">
      <a-spin size="large" />
      <p class="state-loading-tip">{{ scanProgressLabel }}</p>
      <a-progress v-if="showFullPageScanProgress" :percent="scanProgressPercent" class="scan-progress" />
    </div>

    <a-result v-else-if="error" status="error" :title="error" class="state-panel">
      <template #extra>
        <a-button type="primary" @click="scan(true)">重试</a-button>
      </template>
    </a-result>

    <a-empty v-else-if="groups.length === 0" description="未找到媒体文件" class="state-panel" />

    <div v-else class="album-layout">
      <main class="album-main">
        <div class="album-toolbar">
          <a-input
            v-model:value="filenameKeyword"
            class="album-filename-search"
            allow-clear
            placeholder="文件名"
            spellcheck="false"
          />
          <a-range-picker
            v-model:value="captureDateRange"
            class="album-date-range"
            :placeholder="['拍摄起始', '拍摄结束']"
            allow-clear
          />
          <div class="album-toolbar-actions">
            <a-button v-if="inTauri" type="text" size="small" title="打开相册根目录" @click="openAlbumRootInExplorer">
              <template #icon>
                <IconifyIcon icon="ant-design:folder-open-outlined" width="14" height="14" />
              </template>
            </a-button>
            <a-button type="text" size="small" title="清理重复下载" @click="duplicateModalOpen = true">
              <template #icon>
                <IconifyIcon icon="ant-design:clear-outlined" width="14" height="14" />
              </template>
            </a-button>
            <a-button type="text" size="small" :loading="loading" title="刷新相册（强制重扫磁盘）" @click="scan(true)">
              <template #icon>
                <IconifyIcon icon="ant-design:reload-outlined" width="14" height="14" />
              </template>
            </a-button>
          </div>
        </div>

        <div v-if="thumbsGenerating" class="thumb-progress-bar">
          <span>{{ scanProgressLabel }}</span>
          <a-progress :percent="scanProgressPercent" size="small" :show-info="false" class="thumb-progress-track" />
        </div>

        <div class="album-grid-wrap">
          <div ref="scrollEl" class="album-scroll">
            <a-empty v-if="allFiles.length === 0" description="无匹配的媒体文件" class="state-empty-inline" />
            <div v-else class="thumb-canvas" :style="{ height: totalHeight + 'px' }">
              <AlbumThumbCard
                v-for="(file, i) in visibleFiles"
                :key="file.path"
                :file="file"
                :style="cardStyle(startIdx + i)"
                @open="openViewer"
                @delete="onDeleteLocal"
              />
            </div>
          </div>
          <div v-if="timelineLabel && allFiles.length > 0" class="album-timeline-chip" aria-hidden="true">
            {{ timelineLabel }}
          </div>
        </div>
      </main>
    </div>

    <MediaViewer
      v-if="viewerState"
      :groups="viewerGroups"
      :initial-group-idx="viewerState.groupIdx"
      :initial-file-idx="viewerState.fileIdx"
      @close="viewerState = null"
    />

    <IcloudSyncFab />

    <DuplicateCleanupModal v-model:open="duplicateModalOpen" @deleted="onDuplicatesDeleted" />
  </div>
</template>

<style scoped lang="scss">
.album-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
}

.album-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border-color);
}

.album-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.album-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
}

.album-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
}

.album-filename-search {
  width: 160px;
}

.album-date-range {
  width: 260px;
}

.thumb-progress-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--border-color);
}

.thumb-progress-track {
  flex: 1;
  max-width: 200px;
  margin: 0;
}

.state-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.state-loading {
  gap: 12px;
}

.state-loading-tip {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.scan-progress {
  width: min(320px, 80vw);
}

.state-empty-inline {
  padding: 48px 0;
}

.album-grid-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.album-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px;
  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.15);
    border-radius: 4px;
  }
}

.thumb-canvas {
  position: relative;
  width: 100%;
}

/* 宫格区左下角：跟可视末张拍摄月，不随内容滚动、不拦截点击 */
.album-timeline-chip {
  position: absolute;
  bottom: 16px;
  left: 16px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  max-width: min(420px, calc(100% - 32px));
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
  line-height: 1.4;
  color: var(--color-text);
  background: color-mix(in srgb, var(--bg-color) 88%, transparent);
  border: 1px solid var(--border-color);
  pointer-events: none;
  user-select: none;
}
</style>
