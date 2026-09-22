<!--
  相册主页 — 按日分组照片墙
  职责：扫描根目录；目录筛选；左侧年份轴；右侧按日分组宫格；首屏只挂最新一年，滚到顶/底挂邻年；勾选改拍摄时间
  主流程：discover 全库 → 宫格只挂最新年 → 边缘滚动扩展邻年；勾选点格/框选；点击年份只挂该年
-->
<script setup lang="ts">
import IconifyIcon from "@/components/IconifyIcon/index.vue";
import { invoke } from "@tauri-apps/api/core";
import $feedback from "@/utils/feedback";
import { dateUtil } from "@llcz/common";
import { deleteAlbumLocal, openAlbumDir } from "@/api/album";
import { isTauri } from "@/utils/tauri";
import { listen } from "@tauri-apps/api/event";
import { useElementSize, useScroll } from "@vueuse/core";
import AlbumThumbCard from "./components/AlbumThumbCard.vue";
import AlbumYearAxis from "./components/AlbumYearAxis.vue";
import {
  buildAlbumYearAxis,
  filterFilesByYearKeys,
  neighborYearKey,
  pickLatestYearKey,
  stepAlbumYear
} from "./albumYearAxis";
import {
  buildAlbumDayLayout,
  DAY_HEADER_HEIGHT,
  findDaySectionAt,
  sliceVisibleDayLayout
} from "./albumDayLayout";
import CaptureAtRewriteModal from "./components/CaptureAtRewriteModal.vue";
import MediaViewer from "./components/MediaViewer.vue";
import IcloudSyncFab from "./components/IcloudSyncFab.vue";
import QzoneSyncFab from "./components/QzoneSyncFab.vue";
import DuplicateCleanupModal from "./components/DuplicateCleanupModal.vue";
import { ALBUM_LAYOUT, computeAlbumGridLayout } from "./albumLayout";
import { useAlbumGridSelect } from "./useAlbumGridSelect";
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
/** 滚到顶/底约两行内触发邻年挂载 */
const YEAR_EDGE_PX = 120;
const loading = ref(false);
const error = ref("");
const scanProgress = ref<AlbumScanProgressPayload>({ phase: "discover", done: 0, total: 0 });
const viewerState = ref<{ groupIdx: number; fileIdx: number } | null>(null);
const duplicateModalOpen = ref(false);
/** 目录筛选（空=全部；含子孙） */
const dirFilter = ref<string | null>(null);
const captureRewriteOpen = ref(false);
/**
 * 右侧已挂载的年份（升序）
 * discover 仍全库；宫格只渲染这些年。首屏只有最新一年
 */
const loadedYearKeys = ref<string[]>([]);
/** 扫完/筛完/点最新年时钉在底部；往上扩年时关掉，避免把视口拽走 */
let preferBottom = true;
/** 邻年挂载中，避免滚动边缘连触发 */
let yearLoadLocked = false;
/** 程序化滚底后短暂忽略边缘扩年，避免首屏钉底立刻挂上下一年 */
let suppressEdgeUntil = 0;

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
 * 拍摄时间排序键：可解析 captureAt → ms；空/不可解析 → null（不用 modified）
 * 宫格排序唯一真源在前端：与筛选同处；Rust discover 不再排拍摄序
 */
function mediaTimeSortKey(file: MediaFile): number | null {
  const raw = file.captureAt?.trim();
  if (raw) {
    const d = dateUtil(raw);
    if (d.isValid()) return d.valueOf();
  }
  return null;
}

/** 目录筛（含子孙；空=全部） */
function matchesLocalSearch(file: MediaFile): boolean {
  const dir = dirFilter.value;
  if (dir && !matchesDirOrDescendant(file.relDir, dir)) return false;
  return true;
}

function normalizeRelDir(rel?: string): string {
  const s = (rel ?? ".").trim().replace(/\\/g, "/") || ".";
  return s === "" ? "." : s;
}

/**
 * 目录筛：命中自身或子孙
 * @note 与树下拉「选父含子孙」一致；清空=全部（不再提供「根目录」节点）
 */
function matchesDirOrDescendant(fileRelDir: string | undefined, filter: string): boolean {
  const dir = normalizeRelDir(fileRelDir);
  const f = normalizeRelDir(filter);
  if (!f || f === ".") return true;
  return dir === f || dir.startsWith(`${f}/`);
}

/** Ant TreeSelect 节点（value=relPath；无「根目录」层，清空即全部） */
interface AlbumDirTreeNode {
  title: string;
  value: string;
  key: string;
  children?: AlbumDirTreeNode[];
}

/** 目录树：仅有媒体的相对路径建林；补中间段；不挂 `.` 根节点 */
const dirTree = computed<AlbumDirTreeNode[]>(() => {
  const paths = new Set<string>();
  for (const g of groups.value) {
    const n = normalizeRelDir(g.relPath);
    if (n === ".") continue;
    paths.add(n);
    const parts = n.split("/");
    for (let i = 1; i < parts.length; i++) {
      paths.add(parts.slice(0, i).join("/"));
    }
  }

  const roots: AlbumDirTreeNode[] = [];
  const byPath = new Map<string, AlbumDirTreeNode>();

  const sorted = [...paths].sort((a, b) => a.localeCompare(b, "zh"));
  for (const path of sorted) {
    const parts = path.split("/");
    const node: AlbumDirTreeNode = {
      title: parts[parts.length - 1]!,
      value: path,
      key: path,
      children: []
    };
    byPath.set(path, node);
    if (parts.length === 1) {
      roots.push(node);
      continue;
    }
    const parentPath = parts.slice(0, -1).join("/");
    const parent = byPath.get(parentPath);
    if (parent) (parent.children ??= []).push(node);
    else roots.push(node);
  }

  const prune = (n: AlbumDirTreeNode) => {
    if (!n.children?.length) {
      delete n.children;
      return;
    }
    for (const c of n.children) prune(c);
  };
  for (const r of roots) prune(r);
  return roots;
});

/** 全库过滤 + 拍摄时间升序旧→新；无拍摄时间沉底再比文件名 */
const filteredFiles = computed<MediaFile[]>(() => {
  return [...allMediaFiles.value].filter(matchesLocalSearch).sort((a, b) => {
    const ta = mediaTimeSortKey(a);
    const tb = mediaTimeSortKey(b);
    if (ta != null && tb != null) {
      if (ta !== tb) return ta - tb;
      return a.name.localeCompare(b.name);
    }
    if (ta != null) return -1;
    if (tb != null) return 1;
    return a.name.localeCompare(b.name);
  });
});

/**
 * 当前筛选结果统计：合计 + 图 / 视频 / 实况
 */
const filteredStats = computed(() => {
  let image = 0;
  let video = 0;
  let live = 0;
  for (const f of filteredFiles.value) {
    if (f.kind === "video") video += 1;
    else if (f.kind === "livephoto") live += 1;
    else image += 1;
  }
  return { total: filteredFiles.value.length, image, video, live };
});

const filteredStatsText = computed(() => {
  const s = filteredStats.value;
  return `合计 ${s.total} · 图片 ${s.image} · 视频 ${s.video} · 实况 ${s.live}`;
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
    $feedback.message.warning("仅桌面端可打开本地目录");
    return;
  }
  try {
    await openAlbumDir(".");
  } catch (e) {
    $feedback.message.error(e instanceof Error ? e.message : String(e) || "打开目录失败");
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
  if (payload.captureAtSource) file.captureAtSource ??= payload.captureAtSource;
  if (payload.captureAtProbed != null) file.captureAtProbed = payload.captureAtProbed;
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
    resetYearWindowToLatest();
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
async function onDeleteLocal(file: MediaFile) {
  if (!isTauri()) return;
  try {
    await $feedback.confirm(`将从磁盘删除「${file.name}」，不影响 iCloud 云端。`, {
      title: "删除本地文件？",
      okText: "删除"
    });
  } catch {
    return;
  }
  const paths = [file.path];
  if (file.videoPath?.trim()) paths.push(file.videoPath);
  await deleteAlbumLocal(paths);
  $feedback.message.success("已删除本地文件");
  groups.value = groups.value.map(g => ({
    ...g,
    files: g.files.filter(f => f.path !== file.path)
  }));
}

// ===== 按日分组虚拟滚动：只挂已加载年份；边缘再扩邻年 =====
const scrollEl = ref<HTMLElement | null>(null);
const { width: containerWidth, height: viewportHeight } = useElementSize(scrollEl);
const { y: scrollTop } = useScroll(scrollEl, { throttle: 60 });

/** 右侧照片墙内容区宽度 − 左右 padding；左侧年份轴在 scroll 外面，不占这份宽度 */
const gridAvailWidth = computed(() => Math.max(0, containerWidth.value - GRID_PADDING * 2));
const gridLayout = computed(() => computeAlbumGridLayout(gridAvailWidth.value));
const cols = computed(() => gridLayout.value.cols);
const thumbSize = computed(() => gridLayout.value.thumbSize);
const rowHeight = computed(() => gridLayout.value.rowHeight);

/** 全库筛选结果（目录）；左侧轴与统计用这份，不随年份窗口变 */
const catalogFiles = computed<MediaFile[]>(() => filteredFiles.value);
const yearAxis = computed(() => buildAlbumYearAxis(catalogFiles.value));

/** 右侧当前挂载年份内的媒体 */
const displayFiles = computed(() => filterFilesByYearKeys(catalogFiles.value, loadedYearKeys.value));

const dayLayout = computed(() =>
  buildAlbumDayLayout(displayFiles.value, cols.value, thumbSize.value, GAP)
);
const totalHeight = computed(() => dayLayout.value.totalHeight);
const thumbPlacements = computed(() => dayLayout.value.placements);

const {
  selectMode,
  orderedPaths: selectedPaths,
  marqueeStyle,
  marqueeActive,
  isSelected,
  enterSelectMode,
  exitSelectMode,
  togglePath,
  onPointerDown: onGridPointerDown,
  onDragStart: onGridDragStart
} = useAlbumGridSelect(displayFiles, thumbPlacements);

/** 宫格勾选 → 修改拍摄时间弹窗候选 */
const rewriteCandidateFiles = computed(() =>
  selectedPaths.value.map(p => pathIndex.value.get(p)).filter((f): f is MediaFile => !!f)
);

const canvasEl = ref<HTMLElement | null>(null);

function onAlbumPointerDown(event: PointerEvent) {
  const scroll = scrollEl.value;
  const canvas = canvasEl.value;
  if (!scroll || !canvas) return;
  onGridPointerDown(event, { scrollEl: scroll, canvasEl: canvas });
}

function onThumbToggle(file: MediaFile) {
  togglePath(file.path);
}

const bufferPx = computed(() => Math.max(YEAR_EDGE_PX, BUFFER_ROWS * rowHeight.value));
const visibleSlice = computed(() =>
  sliceVisibleDayLayout(dayLayout.value, scrollTop.value, viewportHeight.value, bufferPx.value)
);
const visibleSections = computed(() => visibleSlice.value.sections);
const visiblePlacements = computed(() => visibleSlice.value.placements);

/** 高亮：可视区顶部落在哪一天所属年 */
const activeYearKey = computed(() => findDaySectionAt(dayLayout.value, scrollTop.value)?.yearKey ?? "");

/**
 * 重置为只挂最新一年并滚到底
 * 扫描完成、目录筛选变化时调用
 */
function resetYearWindowToLatest() {
  const latest = pickLatestYearKey(yearAxis.value);
  loadedYearKeys.value = latest ? [latest] : [];
  preferBottom = true;
  scrollAlbumToBottom();
}

/** 滚到最新一端 */
function scrollAlbumToBottom() {
  suppressEdgeUntil = Date.now() + 500;
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

function scrollAlbumToTop() {
  suppressEdgeUntil = Date.now() + 500;
  const el = scrollEl.value;
  if (!el) return;
  el.scrollTop = 0;
  scrollTop.value = 0;
}

/**
 * 点击 / 键盘切到某年：只挂该年
 * 最新一年钉底，其它年从该年第一天顶起
 */
function focusYear(yearKey: string) {
  if (!yearKey || !yearAxis.value.some(year => year.key === yearKey)) return;
  const latest = pickLatestYearKey(yearAxis.value);
  loadedYearKeys.value = [yearKey];
  preferBottom = yearKey === latest;
  nextTick(() => {
    if (preferBottom) scrollAlbumToBottom();
    else scrollAlbumToTop();
  });
}

/** 往上：在已挂载窗口顶部插入更早一年，并补偿 scrollTop */
async function loadPrevYear() {
  if (yearLoadLocked) return;
  const first = loadedYearKeys.value[0];
  if (!first) return;
  const prev = neighborYearKey(yearAxis.value, first, -1);
  if (!prev || loadedYearKeys.value.includes(prev)) return;
  yearLoadLocked = true;
  preferBottom = false;
  const beforeHeight = dayLayout.value.totalHeight;
  loadedYearKeys.value = [prev, ...loadedYearKeys.value];
  await nextTick();
  const added = dayLayout.value.totalHeight - beforeHeight;
  const el = scrollEl.value;
  if (el && added > 0) {
    el.scrollTop += added;
    scrollTop.value = el.scrollTop;
  }
  yearLoadLocked = false;
}

/** 往下：在窗口底部接上更晚一年（或未知） */
async function loadNextYear() {
  if (yearLoadLocked) return;
  const last = loadedYearKeys.value[loadedYearKeys.value.length - 1];
  if (!last) return;
  const next = neighborYearKey(yearAxis.value, last, 1);
  if (!next || loadedYearKeys.value.includes(next)) return;
  yearLoadLocked = true;
  preferBottom = false;
  loadedYearKeys.value = [...loadedYearKeys.value, next];
  await nextTick();
  yearLoadLocked = false;
}

/**
 * 上下键只切年份（改挂载窗口）
 * 目录树、弹层里的方向键留给控件自己
 */
function shouldIgnoreYearKey(event: KeyboardEvent): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey) return true;
  if (captureRewriteOpen.value || viewerState.value || duplicateModalOpen.value) return true;
  const el = event.target;
  if (!(el instanceof HTMLElement)) return false;
  return !!el.closest("input, textarea, select, [contenteditable='true'], .ant-select, .ant-picker, .ant-modal, .ant-drawer, .ant-dropdown");
}

function onAlbumYearKey(event: KeyboardEvent) {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  if (shouldIgnoreYearKey(event) || yearAxis.value.length === 0) return;
  const delta = event.key === "ArrowUp" ? -1 : 1;
  const next = stepAlbumYear(yearAxis.value, activeYearKey.value || loadedYearKeys.value[0] || "", delta);
  if (!next) return;
  event.preventDefault();
  focusYear(next.key);
}

function placementStyle(item: { left: number; top: number; width: number; height: number }): Record<string, string> {
  return {
    left: `${item.left}px`,
    top: `${item.top}px`,
    width: `${item.width}px`,
    height: `${item.height}px`
  };
}

function dayHeaderStyle(headerTop: number): Record<string, string> {
  return {
    top: `${headerTop}px`,
    height: `${DAY_HEADER_HEIGHT}px`
  };
}

watch(dirFilter, () => {
  resetYearWindowToLatest();
});

/** 目录或元数据变化导致年份表变了时，丢掉已不存在的挂载年 */
watch(yearAxis, years => {
  if (years.length === 0) {
    loadedYearKeys.value = [];
    return;
  }
  const alive = new Set(years.map(year => year.key));
  const kept = loadedYearKeys.value.filter(key => alive.has(key));
  if (kept.length === 0) resetYearWindowToLatest();
  else if (kept.length !== loadedYearKeys.value.length) loadedYearKeys.value = kept;
});

/** 首帧高度为 0 时钉底；扩年时 preferBottom=false 不抢视口 */
watch([totalHeight, viewportHeight], () => {
  if (!preferBottom || totalHeight.value <= 0) return;
  scrollAlbumToBottom();
});

/** 滚到顶/底挂邻年 */
watch(scrollTop, () => {
  const el = scrollEl.value;
  if (!el || yearLoadLocked || displayFiles.value.length === 0) return;
  if (Date.now() < suppressEdgeUntil) return;
  if (scrollTop.value <= YEAR_EDGE_PX) void loadPrevYear();
  const distanceBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  if (distanceBottom <= YEAR_EDGE_PX) void loadNextYear();
});

let unlistenScanProgress: (() => void) | undefined;
let unlistenThumbReady: (() => void) | undefined;

onMounted(async () => {
  window.addEventListener("keydown", onAlbumYearKey);
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
  window.removeEventListener("keydown", onAlbumYearKey);
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
          <a-tree-select
            v-model:value="dirFilter"
            class="album-dir-filter"
            allow-clear
            show-search
            tree-default-expand-all
            placeholder="全部目录"
            tree-node-filter-prop="title"
            :tree-data="dirTree"
            :dropdown-style="{ maxHeight: '360px', overflow: 'auto' }"
          />
          <span class="album-stats" :title="filteredStatsText">{{ filteredStatsText }}</span>
          <div class="album-toolbar-actions">
            <template v-if="!selectMode">
              <a-button size="small" :disabled="catalogFiles.length === 0" @click="enterSelectMode">勾选</a-button>
            </template>
            <template v-else>
              <a-button type="primary" size="small" :disabled="selectedPaths.length === 0" @click="captureRewriteOpen = true">
                修改拍摄时间{{ selectedPaths.length ? ` (${selectedPaths.length})` : "" }}
              </a-button>
              <a-button size="small" @click="exitSelectMode">取消勾选</a-button>
            </template>
            <a-button v-if="inTauri" shape="circle" title="打开相册根目录" @click="openAlbumRootInExplorer">
              <template #icon>
                <IconifyIcon icon="ant-design:folder-open-outlined" width="16px" height="16px" />
              </template>
            </a-button>
            <a-button shape="circle" title="清理重复下载" @click="duplicateModalOpen = true">
              <template #icon>
                <IconifyIcon icon="ant-design:clear-outlined" width="16px" height="16px" />
              </template>
            </a-button>
            <a-button shape="circle" :loading="loading" title="刷新相册（强制重扫磁盘）" @click="scan(true)">
              <template #icon>
                <IconifyIcon icon="ant-design:reload-outlined" width="16px" height="16px" />
              </template>
            </a-button>
          </div>
        </div>

        <div v-if="thumbsGenerating" class="thumb-progress-bar">
          <span>{{ scanProgressLabel }}</span>
          <a-progress :percent="scanProgressPercent" size="small" :show-info="false" class="thumb-progress-track" />
        </div>

        <div class="album-body">
          <AlbumYearAxis
            v-if="yearAxis.length > 0"
            :years="yearAxis"
            :active-year-key="activeYearKey"
            @select="focusYear"
          />
          <div class="album-grid-wrap">
            <div
              ref="scrollEl"
              class="album-scroll"
              :class="{ 'is-marquee': marqueeActive }"
              @pointerdown="onAlbumPointerDown"
              @dragstart="onGridDragStart"
            >
              <a-empty v-if="catalogFiles.length === 0" description="无匹配的媒体文件" class="state-empty-inline" />
              <div v-else ref="canvasEl" class="thumb-canvas" :style="{ height: totalHeight + 'px' }">
                <div
                  v-for="section in visibleSections"
                  :key="`day-${section.key}`"
                  class="day-header"
                  :style="dayHeaderStyle(section.headerTop)"
                >
                  {{ section.label }}
                </div>
                <AlbumThumbCard
                  v-for="item in visiblePlacements"
                  :key="item.file.path"
                  :file="item.file"
                  :select-mode="selectMode"
                  :selected="isSelected(item.file.path)"
                  :style="placementStyle(item)"
                  @open="openViewer"
                  @toggle="onThumbToggle"
                  @delete="onDeleteLocal"
                />
                <div v-if="marqueeStyle" class="album-marquee" :style="marqueeStyle" />
              </div>
            </div>
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
    <QzoneSyncFab />

    <DuplicateCleanupModal v-model:open="duplicateModalOpen" @deleted="onDuplicatesDeleted" />

    <CaptureAtRewriteModal
      v-model:open="captureRewriteOpen"
      :files="rewriteCandidateFiles"
      @saved="exitSelectMode"
    />
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

.album-stats {
  flex: 1;
  min-width: 120px;
  font-size: 14px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.album-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.album-dir-filter {
  width: 220px;
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

.album-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
}

.album-grid-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
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
  user-select: none;
  &.is-marquee {
    cursor: crosshair;
    user-select: none;
  }
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

.day-header {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  padding: 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  background: color-mix(in srgb, var(--bg-color) 92%, transparent);
  pointer-events: none;
  user-select: none;
}

.album-marquee {
  position: absolute;
  z-index: 4;
  box-sizing: border-box;
  border: 1px solid var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 18%, transparent);
  pointer-events: none;
}

</style>
