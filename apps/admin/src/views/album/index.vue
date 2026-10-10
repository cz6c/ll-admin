<!--
  相册主页 — 图库 / 文件资源双模式
  职责：扫描根目录；图库模式按日宫格+图库筛+年份轴；文件模式面包屑+当前目录文件夹/媒体；两模式可切换
  主流程：discover 全库 → 图库筛（仅图库模式）→ 宫格挂最新年或 cwd 列表；
  意图先行（双模式）：更多菜单进「改拍摄时间 / 批量删除」→ 左侧展开执行按钮+取消；
  图库勾选宫格；文件勾选当前层同级（文件夹执行时再展开子孙，意图内不可进目录）；
  右键：在资源管理器中显示 / 删除本地
-->
<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import $feedback from "@/utils/feedback";
import { dateUtil } from "@llcz/common";
import { deleteAlbumLocal, revealAlbumInExplorer, type AlbumPathRename } from "@/api/album";
import { useCsSettingsModal } from "@/composables/useCsSettingsModal";
import { isTauri } from "@/utils/tauri";
import { useElementSize, useScroll } from "@vueuse/core";
import AlbumThumbCard from "./components/AlbumThumbCard.vue";
import AlbumFileBrowser from "./components/AlbumFileBrowser.vue";
import AlbumYearAxis from "./components/AlbumYearAxis.vue";
import {
  albumDirExists,
  buildAlbumBreadcrumb,
  buildAlbumDirIndex,
  collectMediaUnderDir,
  listAlbumCwd,
  normalizeAlbumRelDir,
  type AlbumRelDir
} from "./albumFileBrowser";
import { collectLibraryOptions, matchesLibrary } from "./albumLibrary";
import { buildAlbumYearAxis, filterFilesByYearKeys } from "./albumYearAxis";
import { buildAlbumDayLayout, DAY_HEADER_HEIGHT, findDaySectionAt, sliceVisibleDayLayout } from "./albumDayLayout";
import type { AlbumFilePlacement } from "./albumFileLayout";
import CaptureAtRewriteModal from "./components/CaptureAtRewriteModal.vue";
import MediaViewer from "./components/MediaViewer.vue";
import IcloudSyncFab from "./components/IcloudSyncFab.vue";
import QzoneSyncFab from "./components/QzoneSyncFab.vue";
import DuplicateCleanupModal from "./components/DuplicateCleanupModal.vue";
import { ALBUM_LAYOUT, computeAlbumGridLayout } from "./albumLayout";
import { useAlbumModeSelect, type AlbumViewMode } from "./useAlbumModeSelect";
import { useAlbumScan } from "./useAlbumScan";
import { ALBUM_YEAR_EDGE_PX, useAlbumYearWindow } from "./useAlbumYearWindow";
import type { MediaFile, MediaGroup } from "./types";

defineOptions({ name: "AlbumGallery" });

const VIEW_MODE_STORAGE_KEY = "album.viewMode";

/** CS 桌面端才支持 opener 打开本地目录 */
const inTauri = isTauri();
const { open: openCsSettings } = useCsSettingsModal();

const groups = ref<MediaGroup[]>([]);
const rootDir = ref("");
const { gridGap: GAP, gridPadding: GRID_PADDING, bufferRows: BUFFER_ROWS } = ALBUM_LAYOUT;
const viewerState = ref<{ groupIdx: number; fileIdx: number } | null>(null);
const duplicateModalOpen = ref(false);

function readStoredViewMode(): AlbumViewMode {
  try {
    return localStorage.getItem(VIEW_MODE_STORAGE_KEY) === "files" ? "files" : "gallery";
  } catch {
    return "gallery";
  }
}

const viewMode = ref<AlbumViewMode>(readStoredViewMode());

/** 文件模式当前目录（`.` = 相册根） */
const cwdRel = ref<AlbumRelDir>(".");

/**
 * 图库筛选（null=全部图库；仅图库模式展示与生效）
 * allow-clear 会把 a-select 写成 undefined；matchesLibrary 只认 null 为全部，须收回 null
 */
const libraryFilter = ref<string | null>(null);
watch(
  libraryFilter,
  value => {
    if (value == null && libraryFilter.value !== null) libraryFilter.value = null;
  },
  { flush: "sync" }
);
const captureRewriteOpen = ref(false);
/**
 * 右侧已挂载的年份（升序）
 * discover 仍全库；宫格只渲染这些年。首屏只有最新一年
 */
const loadedYearKeys = ref<string[]>([]);

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

/** 图库下拉：当前已入库文件按 (origin, originAccount) 去重 */
const librarySelectOptions = computed(() => collectLibraryOptions(allMediaFiles.value));

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

/** 图库模式：仅图库筛（文件模式另用全库索引，无图库筛） */
function matchesGalleryFilter(file: MediaFile): boolean {
  return matchesLibrary(file, libraryFilter.value);
}

/** 图库过滤 + 拍摄时间升序旧→新；无拍摄时间沉底再比文件名 */
const filteredFiles = computed<MediaFile[]>(() => {
  return [...allMediaFiles.value].filter(matchesGalleryFilter).sort((a, b) => {
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

/** 文件模式：扫描索引派生的目录树（全库、不做图库筛） */
const dirIndex = computed(() => buildAlbumDirIndex(allMediaFiles.value));
const cwdListing = computed(() => listAlbumCwd(dirIndex.value, cwdRel.value));
const cwdFolders = computed(() => cwdListing.value.folders);
const cwdFiles = computed(() => cwdListing.value.files);
const fileBreadcrumbs = computed(() => buildAlbumBreadcrumb(cwdRel.value));

/** 当前模式用于统计 / 灯箱邻接的媒体列表 */
const activeMediaFiles = computed(() => (viewMode.value === "gallery" ? filteredFiles.value : cwdFiles.value));

/**
 * 当前列表统计：合计 + 图 / 视频 / 实况
 */
const filteredStats = computed(() => {
  let image = 0;
  let video = 0;
  let live = 0;
  for (const f of activeMediaFiles.value) {
    if (f.kind === "video") video += 1;
    else if (f.kind === "livephoto") live += 1;
    else image += 1;
  }
  return { total: activeMediaFiles.value.length, image, video, live };
});

const filteredStatsText = computed(() => {
  const s = filteredStats.value;
  return `合计 ${s.total} · 图片 ${s.image} · 视频 ${s.video} · 实况 ${s.live}`;
});

/** Viewer 单组，与当前模式列表一致，避免索引错位 */
const viewerGroups = computed<MediaGroup[]>(() => {
  if (activeMediaFiles.value.length === 0) return [];
  return [
    {
      dirName: viewMode.value === "gallery" ? "全部" : (fileBreadcrumbs.value.at(-1)?.title ?? "当前文件夹"),
      dirPath: rootDir.value || ".",
      relPath: viewMode.value === "gallery" ? "." : cwdRel.value,
      files: activeMediaFiles.value
    }
  ];
});

/** cwd 被扫描结果掏空时退回根，避免停在幽灵路径 */
watch(dirIndex, index => {
  if (!albumDirExists(index, cwdRel.value)) cwdRel.value = ".";
});

/** 右键：在资源管理器中显示并选中该文件 */
async function onRevealInExplorer(file: MediaFile) {
  if (!inTauri) {
    $feedback.message.warning("仅桌面端可打开资源管理器");
    return;
  }
  try {
    await revealAlbumInExplorer(file.path);
  } catch (e) {
    $feedback.message.error(e instanceof Error ? e.message : String(e) || "在资源管理器中显示失败");
  }
}

async function loadSettings() {
  try {
    const settings = await invoke<{ rootDir: string }>("album_get_settings");
    rootDir.value = settings.rootDir || "";
  } catch (e) {
    console.error("Failed to load album settings:", e);
  }
}

/** 空态引导：保存根目录后回到当前页并触发扫描 */
async function openAlbumSettingsFromEmpty() {
  openCsSettings({
    onSaved: async () => {
      await loadSettings();
      if (rootDir.value) {
        await scan();
      }
    }
  });
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

/** 图库全库筛选结果；左侧轴用这份，不随年份窗口变 */
const catalogFiles = computed<MediaFile[]>(() => filteredFiles.value);
const yearAxis = computed(() => buildAlbumYearAxis(catalogFiles.value));

/** 右侧当前挂载年份内的媒体 */
const displayFiles = computed(() => filterFilesByYearKeys(catalogFiles.value, loadedYearKeys.value));

const dayLayout = computed(() => buildAlbumDayLayout(displayFiles.value, cols.value, thumbSize.value, GAP));
const totalHeight = computed(() => dayLayout.value.totalHeight);
const thumbPlacements = computed(() => dayLayout.value.placements);

/** 高亮：可视区顶部落在哪一天所属年 */
const activeYearKey = computed(() => findDaySectionAt(dayLayout.value, scrollTop.value)?.yearKey ?? "");

const viewerOpen = computed(() => !!viewerState.value);

const { resetYearWindowToLatest, focusYear, revealFilePath, onAlbumYearKey } = useAlbumYearWindow({
  loadedYearKeys,
  yearAxis,
  dayLayout,
  catalogFiles,
  displayFiles,
  scrollEl,
  scrollTop,
  viewportHeight,
  totalHeight,
  libraryFilter,
  captureRewriteOpen,
  viewerOpen,
  duplicateModalOpen,
  activeYearKey
});

const { loading, error, scanProgressPercent, scanProgressLabel, thumbsGenerating, showFullPageScanProgress, scan, bindScanListeners, cancelScan } =
  useAlbumScan({
    rootDir,
    groups,
    pathIndex,
    onScanComplete: resetYearWindowToLatest
  });

/** 文件模式框选用：子组件回传全量格子坐标 */
const filePlacements = ref<AlbumFilePlacement[]>([]);
/** 图库框选宿主：thumb-canvas */
const canvasEl = ref<HTMLElement | null>(null);

const {
  intent,
  selectMode,
  selectedPaths,
  marqueeStyle,
  marqueeActive,
  isSelected,
  isFolderSelected,
  enterIntent,
  exitIntent,
  removePaths,
  remapPaths,
  toggleGalleryPath,
  onGalleryPointerDown,
  onGalleryDragStart,
  toggleFilePath,
  toggleFolder,
  onFilePointerDown,
  onFileDragStart
} = useAlbumModeSelect({
  viewMode,
  galleryFiles: displayFiles,
  galleryPlacements: thumbPlacements,
  allFiles: allMediaFiles,
  dirIndex,
  filePlacements,
  cwdFolders,
  cwdFiles
});

/** 模式切换：记忆偏好并清空意图 */
watch(viewMode, mode => {
  try {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    /* 隐私模式等写失败可忽略 */
  }
  exitIntent();
});

/** 换图库清空勾选，避免跨库误改 / 误删 */
watch(libraryFilter, () => {
  if (viewMode.value === "gallery") exitIntent();
});

/** 面包屑换目录清空意图（不可跨目录累积勾选） */
watch(cwdRel, () => {
  if (viewMode.value === "files") exitIntent();
});

/**
 * 可开意图的媒体数：图库=当前图库筛结果；文件=cwd 含子树
 * 为 0 时禁用更多菜单两项
 */
const intentCatalogCount = computed(() =>
  viewMode.value === "gallery" ? catalogFiles.value.length : collectMediaUnderDir(dirIndex.value, cwdRel.value).length
);

function navigateFileCwd(relPath: AlbumRelDir) {
  cwdRel.value = normalizeAlbumRelDir(relPath);
}

function onFileEnterFolder(relPath: string) {
  navigateFileCwd(relPath);
}

/** 右侧单按钮：在图库 / 文件之间切换 */
function toggleViewMode() {
  viewMode.value = viewMode.value === "gallery" ? "files" : "gallery";
}

const viewModeToggleTitle = computed(() => (viewMode.value === "gallery" ? "切换到文件模式" : "切换到图库模式"));

const viewModeToggleIcon = computed(() => (viewMode.value === "gallery" ? "ant-design:folder-outlined" : "ant-design:appstore-outlined"));

/** 勾选 → 修改拍摄时间弹窗 / 批量删除候选 */
const selectedFiles = computed(() => selectedPaths.value.map(p => pathIndex.value.get(p)).filter((f): f is MediaFile => !!f));
const selectedCount = computed(() => selectedPaths.value.length);
/** 意图内左侧执行按钮文案（含已勾数量） */
const activeIntentLabel = computed(() => {
  if (intent.value === "captureAt") return `修改拍摄时间 (${selectedCount.value})`;
  if (intent.value === "delete") return `批量删除 (${selectedCount.value})`;
  return "";
});
const batchDeleting = ref(false);

function onThumbToggle(file: MediaFile) {
  toggleGalleryPath(file.path);
}

function onAlbumPointerDown(event: PointerEvent) {
  const scroll = scrollEl.value;
  const canvas = canvasEl.value;
  if (!scroll || !canvas) return;
  onGalleryPointerDown(event, { scrollEl: scroll, canvasEl: canvas });
}

function onFileToggle(file: MediaFile) {
  toggleFilePath(file.path);
}

function onFileToggleFolder(relPath: string) {
  toggleFolder(relPath);
}

function onFileBrowserPointerDown(event: PointerEvent, host: { scrollEl: HTMLElement; canvasEl: HTMLElement }) {
  onFilePointerDown(event, host);
}

/** 更多菜单：进入意图（执行须再点左侧文字按钮） */
function onBatchMenuClick(info: { key: string | number }) {
  const key = String(info.key);
  if (key === "captureAt" || key === "delete") enterIntent(key);
}

/** 意图内：左侧文字按钮执行当前批量操作 */
function onActiveIntentClick() {
  if (intent.value === "captureAt") {
    if (selectedCount.value === 0) {
      $feedback.message.warning("请先勾选要修改拍摄时间的照片");
      return;
    }
    captureRewriteOpen.value = true;
    return;
  }
  if (intent.value === "delete") void confirmBatchDeleteLocal();
}

const bufferPx = computed(() => Math.max(ALBUM_YEAR_EDGE_PX, BUFFER_ROWS * rowHeight.value));
const visibleSlice = computed(() => sliceVisibleDayLayout(dayLayout.value, scrollTop.value, viewportHeight.value, bufferPx.value));
const visibleSections = computed(() => visibleSlice.value.sections);
const visiblePlacements = computed(() => visibleSlice.value.placements);

function openViewer(file: MediaFile) {
  const fi = activeMediaFiles.value.findIndex(f => f.path === file.path);
  if (fi >= 0) {
    viewerState.value = { groupIdx: 0, fileIdx: fi };
  }
}

/** 灯箱关闭：图库模式滚回宫格；文件模式保持 cwd */
function onViewerClose(filePath?: string) {
  viewerState.value = null;
  if (filePath && viewMode.value === "gallery") void revealFilePath(filePath);
}

function onDuplicatesDeleted() {
  void scan(true);
}

/** 从 groups 去掉已删 path（含 Live 成对仍存在的仍项由 path 过滤） */
function removeFilesFromGroups(removedPaths: Set<string>) {
  groups.value = groups.value.map(g => ({
    ...g,
    files: g.files.filter(f => !removedPaths.has(f.path))
  }));
}

/** 收集删除用盘路径：主 path + 可选 videoPath（Live mov） */
function collectDeleteDiskPaths(files: MediaFile[]): string[] {
  const paths: string[] = [];
  for (const file of files) {
    paths.push(file.path);
    if (file.videoPath?.trim()) paths.push(file.videoPath);
  }
  return paths;
}

/** 右键删除本地文件（不触碰 iCloud sync assets） */
async function onDeleteLocal(file: MediaFile) {
  if (!isTauri()) return;
  try {
    // 灯箱已全屏盖住 ToolsBar：确认须抬 z-index，且 fullscreen 类取消 CS 扣顶，否则遮罩露顶栏
    await $feedback.confirm(`将从磁盘删除「${file.name}」。`, {
      title: "删除本地文件？",
      okText: "删除",
      ...(viewerState.value
        ? { zIndex: 11000, wrapClassName: "feedback-confirm-fullscreen" }
        : {})
    });
  } catch {
    return;
  }
  await deleteAlbumLocal(collectDeleteDiskPaths([file]));
  $feedback.message.success("已删除本地文件");
  removeFilesFromGroups(new Set([file.path]));
}

/**
 * 批量删除本地：仅磁盘，不碰云端；确认后一次性 deleteAlbumLocal
 */
async function confirmBatchDeleteLocal() {
  if (!isTauri()) return;
  const files = selectedFiles.value;
  if (files.length === 0) {
    $feedback.message.warning("请先勾选要删除的照片");
    return;
  }
  try {
    await $feedback.confirm(`将从磁盘删除所选 ${files.length} 项。`, {
      title: "批量删除本地文件？",
      okText: "删除"
    });
  } catch {
    return;
  }
  if (batchDeleting.value) return;
  batchDeleting.value = true;
  try {
    const mediaPaths = files.map(f => f.path);
    await deleteAlbumLocal(collectDeleteDiskPaths(files));
    removeFilesFromGroups(new Set(mediaPaths));
    removePaths(mediaPaths);
    $feedback.message.success(`已删除 ${files.length} 项本地文件`);
  } catch (e) {
    $feedback.message.error(e instanceof Error ? e.message : String(e) || "删除失败");
  } finally {
    batchDeleting.value = false;
  }
}

/** 改拍摄时间成功：同步勾选 path（可能因改名变化），不退出意图 */
function onCaptureAtSaved(renames: AlbumPathRename[] = []) {
  remapPaths(renames);
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

let unbindScanListeners: (() => void) | undefined;

/** 年份快捷键仅图库模式 */
function onAlbumKey(event: KeyboardEvent) {
  if (viewMode.value !== "gallery") return;
  onAlbumYearKey(event);
}

onMounted(async () => {
  window.addEventListener("keydown", onAlbumKey);
  unbindScanListeners = await bindScanListeners();

  await loadSettings();
  if (rootDir.value) {
    await scan();
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onAlbumKey);
  unbindScanListeners?.();
  cancelScan();
});
</script>

<template>
  <div class="album-page">
    <a-result v-if="!rootDir && !loading" status="info" title="未设置相册根目录" class="state-panel">
      <template #extra>
        <a-button type="primary" @click="openAlbumSettingsFromEmpty">前往设置</a-button>
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
          <a-select
            v-if="viewMode === 'gallery'"
            v-model:value="libraryFilter"
            class="album-library-filter"
            allow-clear
            placeholder="全部图库"
            :options="librarySelectOptions"
          />
          <nav v-else class="album-file-crumbs" aria-label="当前路径">
            <template v-for="(crumb, idx) in fileBreadcrumbs" :key="crumb.relPath">
              <span v-if="idx > 0" class="crumb-sep" aria-hidden="true">/</span>
              <button
                type="button"
                class="crumb-btn"
                :class="{ 'is-current': idx === fileBreadcrumbs.length - 1 }"
                :disabled="idx === fileBreadcrumbs.length - 1"
                @click="navigateFileCwd(crumb.relPath)"
              >
                {{ crumb.title }}
              </button>
            </template>
          </nav>
          <span class="album-stats" :title="filteredStatsText">{{ filteredStatsText }}</span>
          <div class="album-toolbar-actions">
            <!-- 意图内：左侧展开当前操作 + 取消；空闲收进「更多」圆形按钮 -->
            <template v-if="intent">
              <a-button
                size="small"
                type="primary"
                :danger="intent === 'delete'"
                :loading="intent === 'delete' && batchDeleting"
                :disabled="intent === 'delete' && !inTauri"
                @click="onActiveIntentClick"
              >
                {{ activeIntentLabel }}
              </a-button>
              <a-button size="small" @click="exitIntent">取消</a-button>
            </template>
            <a-dropdown v-else :trigger="['click']">
              <a-button shape="circle" title="批量操作" @click.prevent>
                <template #icon>
                  <CcIconifyIcon icon="ant-design:more-outlined" width="16px" height="16px" />
                </template>
              </a-button>
              <template #overlay>
                <a-menu @click="onBatchMenuClick">
                  <a-menu-item key="captureAt" :disabled="intentCatalogCount === 0">修改拍摄时间</a-menu-item>
                  <a-menu-item key="delete" danger :disabled="intentCatalogCount === 0 || !inTauri">批量删除</a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
            <a-button shape="circle" :title="viewModeToggleTitle" @click="toggleViewMode">
              <template #icon>
                <CcIconifyIcon :icon="viewModeToggleIcon" width="16px" height="16px" />
              </template>
            </a-button>
            <a-button shape="circle" title="清理重复下载" @click="duplicateModalOpen = true">
              <template #icon>
                <CcIconifyIcon icon="ant-design:clear-outlined" width="16px" height="16px" />
              </template>
            </a-button>
            <a-button shape="circle" :loading="loading" title="刷新相册（强制重扫磁盘）" @click="scan(true)">
              <template #icon>
                <CcIconifyIcon icon="ant-design:reload-outlined" width="16px" height="16px" />
              </template>
            </a-button>
          </div>
        </div>

        <div v-if="thumbsGenerating" class="thumb-progress-bar">
          <span>{{ scanProgressLabel }}</span>
          <a-progress :percent="scanProgressPercent" size="small" :show-info="false" class="thumb-progress-track" />
        </div>

        <div v-if="viewMode === 'gallery'" class="album-body">
          <AlbumYearAxis v-if="yearAxis.length > 0" :years="yearAxis" :active-year-key="activeYearKey" @select="focusYear" />
          <div class="album-grid-wrap">
            <div ref="scrollEl" class="album-scroll" :class="{ 'is-marquee': marqueeActive }" @pointerdown="onAlbumPointerDown" @dragstart="onGalleryDragStart">
              <a-empty v-if="catalogFiles.length === 0" description="无匹配的媒体文件" class="state-empty-inline" />
              <div v-else ref="canvasEl" class="thumb-canvas" :style="{ height: totalHeight + 'px' }">
                <div v-for="section in visibleSections" :key="`day-${section.key}`" class="day-header" :style="dayHeaderStyle(section.headerTop)">
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
                  @reveal="onRevealInExplorer"
                />
                <div v-if="marqueeStyle" class="album-marquee" :style="marqueeStyle" />
              </div>
            </div>
          </div>
        </div>

        <AlbumFileBrowser
          v-else
          :folders="cwdFolders"
          :files="cwdFiles"
          :select-mode="selectMode"
          :is-selected="isSelected"
          :is-folder-selected="isFolderSelected"
          :marquee-style="marqueeStyle"
          :marquee-active="marqueeActive"
          @update:placements="filePlacements = $event"
          @enter-folder="onFileEnterFolder"
          @open="openViewer"
          @delete="onDeleteLocal"
          @reveal="onRevealInExplorer"
          @toggle-file="onFileToggle"
          @toggle-folder="onFileToggleFolder"
          @pointer-down="onFileBrowserPointerDown"
          @drag-start="onFileDragStart"
        />
      </main>
    </div>

    <MediaViewer
      v-if="viewerState"
      :groups="viewerGroups"
      :initial-group-idx="viewerState.groupIdx"
      :initial-file-idx="viewerState.fileIdx"
      @close="onViewerClose"
      @delete="onDeleteLocal"
    />

    <IcloudSyncFab />
    <QzoneSyncFab />

    <DuplicateCleanupModal v-model:open="duplicateModalOpen" @deleted="onDuplicatesDeleted" />

    <CaptureAtRewriteModal v-model:open="captureRewriteOpen" :files="selectedFiles" @saved="onCaptureAtSaved" />
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

.album-library-filter {
  width: 220px;
}

.album-file-crumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: min(480px, 40vw);
  font-size: 14px;
}

.crumb-sep {
  color: var(--color-text-quaternary);
  user-select: none;
}

.crumb-btn {
  margin: 0;
  padding: 0 2px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &.is-current,
  &:disabled {
    color: var(--color-text);
    cursor: default;
  }

  &:not(:disabled):hover {
    background: var(--color-fill-secondary);
  }
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
    background: var(--color-fill);
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
