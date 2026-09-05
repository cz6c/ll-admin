<!--
  相册主页 — 左侧目录树 + 右侧资源宫格
  职责：扫描根目录、按子目录筛选展示；缩略图路径 + 后台增量生成
  主流程：discover → 树/宫格 → 缩略图增量；目录节点右键可打开本地文件夹；侧栏可拖宽
-->
<script setup lang="ts">
import { h } from "vue";
import IconifyIcon from "@/components/IconifyIcon/index.vue";
import { invoke } from "@tauri-apps/api/core";
import { Modal, message } from "ant-design-vue";
import { deleteAlbumLocal, openAlbumDir } from "@/api/album";
import { isTauri } from "@/utils/tauri";
import { listen } from "@tauri-apps/api/event";
import { useElementSize, useScroll } from "@vueuse/core";
import AlbumThumbCard from "./components/AlbumThumbCard.vue";
import MediaViewer from "./components/MediaViewer.vue";
import IcloudSyncFab from "./components/IcloudSyncFab.vue";
import DuplicateCleanupModal from "./components/DuplicateCleanupModal.vue";
import { ALBUM_LAYOUT, computeAlbumGridLayout } from "./albumLayout";
import { useAlbumSidebarResize } from "./useAlbumSidebarResize";
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
const selectedDirKey = ref("");
const duplicateModalOpen = ref(false);

/** path → { groupIdx, fileIdx }，缩略图就绪事件 O(1) 定位，避免遍历全部 group/file */
const pathIndex = computed(() => {
  const map = new Map<string, { groupIdx: number; fileIdx: number }>();
  groups.value.forEach((g, gi) => {
    g.files.forEach((f, fi) => {
      map.set(f.path, { groupIdx: gi, fileIdx: fi });
    });
  });
  return map;
});

/** 侧栏目录树节点（ant-design-vue Tree） */
interface AlbumTreeNode {
  key: string;
  title: string;
  children?: AlbumTreeNode[];
  /** 无下级目录时为 leaf：switcher 留空占位，文字与上级对齐 */
  isLeaf?: boolean;
}

/** Tree switcher 节点态 */
type AlbumTreeSwitcherProps = {
  expanded?: boolean;
};

/** 展开/收起箭头；leaf 由 rc-tree 渲染等宽 noop 占位，此处不处理 */
function albumTreeSwitcherIcon({ expanded }: AlbumTreeSwitcherProps) {
  return h(IconifyIcon, {
    icon: expanded ? "ant-design:folder-open-outlined" : "ant-design:folder-outlined",
    width: 16,
    height: 16
  });
}

/** 统一 relPath 分隔符，避免 Windows `\` 与树节点 key 不一致 */
function normalizeRelPath(rel: string): string {
  if (!rel || rel === ".") return ".";
  return rel.replace(/\\/g, "/").replace(/\/+$/, "") || ".";
}

/** 初始始终选中根目录（即使根下无直接媒体文件，右侧为空宫格） */
function defaultDirKey(): string {
  return ".";
}

/**
 * 按 relPath 分段拼嵌套树（含仅作中间层、自身无媒体的目录）
 * 标题计数为本目录直接文件数，与右侧宫格一致（不含子孙）
 */
function buildAlbumTree(list: MediaGroup[]): AlbumTreeNode[] {
  type Mutable = { key: string; name: string; children: Map<string, Mutable> };

  const fileCount = new Map<string, number>();
  const names = new Map<string, string>();
  for (const g of list) {
    const key = normalizeRelPath(g.relPath);
    fileCount.set(key, g.files.length);
    names.set(key, g.dirName);
  }

  const allKeys = new Set<string>(["."]);
  for (const key of fileCount.keys()) {
    if (key === ".") continue;
    const parts = key.split("/").filter(Boolean);
    for (let i = 1; i <= parts.length; i++) {
      allKeys.add(parts.slice(0, i).join("/"));
    }
  }

  const root: Mutable = {
    key: ".",
    name: names.get(".") || "根目录",
    children: new Map()
  };

  for (const key of allKeys) {
    if (key === ".") continue;
    const parts = key.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i];
      const pathKey = parts.slice(0, i + 1).join("/");
      let child = node.children.get(seg);
      if (!child) {
        child = {
          key: pathKey,
          name: names.get(pathKey) || seg,
          children: new Map()
        };
        node.children.set(seg, child);
      }
      node = child;
    }
  }

  function toNode(n: Mutable): AlbumTreeNode {
    const kids = [...n.children.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })).map(toNode);
    const count = fileCount.get(n.key) ?? 0;
    const hasSubdirs = kids.length > 0;
    return {
      key: n.key,
      title: `${n.name} (${count})`,
      children: hasSubdirs ? kids : undefined,
      isLeaf: !hasSubdirs
    };
  }

  return [toNode(root)];
}

const treeData = computed(() => buildAlbumTree(groups.value));

/** 收集全部节点 key；异步 treeData 下 defaultExpandAll 只生效首次渲染，改用受控 expandedKeys */
function collectTreeKeys(nodes: AlbumTreeNode[]): string[] {
  const keys: string[] = [];
  const walk = (list: AlbumTreeNode[]) => {
    for (const n of list) {
      keys.push(n.key);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return keys;
}

const expandedKeys = ref<string[]>([]);
watch(
  treeData,
  nodes => {
    expandedKeys.value = collectTreeKeys(nodes);
  },
  { immediate: true }
);

/** 当前选中的单个目录分组（供宫格与查看器）；中间空目录无 group → 空宫格 */
const displayGroups = computed<MediaGroup[]>(() => {
  const key = normalizeRelPath(selectedDirKey.value);
  const group = groups.value.find(g => normalizeRelPath(g.relPath) === key);
  return group ? [group] : [];
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

function onTreeSelect(keys: string[]) {
  const key = keys[0];
  if (key) {
    selectedDirKey.value = normalizeRelPath(key);
  }
}

/**
 * 右键：在系统资源管理器中打开该目录（Rust 侧校验须在相册根下）
 */
async function openAlbumDirInExplorer(relKey: string) {
  if (!inTauri) {
    message.warning("仅桌面端可打开本地目录");
    return;
  }
  try {
    await openAlbumDir(normalizeRelPath(relKey));
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e) || "打开目录失败");
  }
}

function applyThumbReady(payload: AlbumThumbReadyPayload) {
  const pos = pathIndex.value.get(payload.path);
  if (!pos) return;
  const file = groups.value[pos.groupIdx]?.files?.[pos.fileIdx];
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
  selectedDirKey.value = "";
  scanProgress.value = { phase: "discover", done: 0, total: 0 };
  try {
    const result = await invoke<MediaGroup[]>("album_scan", {
      root: rootDir.value,
      thumbSize: ALBUM_THUMB_GENERATE_SIZE,
      force
    });
    groups.value = result;
    selectedDirKey.value = defaultDirKey();
  } catch (e: unknown) {
    error.value = typeof e === "string" ? e : "扫描失败";
  } finally {
    loading.value = false;
  }
}

function openViewer(file: MediaFile) {
  for (let gi = 0; gi < displayGroups.value.length; gi++) {
    const fi = displayGroups.value[gi].files.findIndex(f => f.path === file.path);
    if (fi >= 0) {
      viewerState.value = { groupIdx: gi, fileIdx: fi };
      return;
    }
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

const { sidebarWidth, sidebarResizing, layoutContainerWidth, onSidebarResizeStart, onSidebarResizeMove, onSidebarResizeEnd, resetSidebarWidth } =
  useAlbumSidebarResize(containerWidth);

/** scroll 内容区宽度 − 左右 padding；拖侧栏时用节流后的 layoutContainerWidth */
const gridAvailWidth = computed(() => Math.max(0, layoutContainerWidth.value - GRID_PADDING * 2));
const gridLayout = computed(() => computeAlbumGridLayout(gridAvailWidth.value));
const cols = computed(() => gridLayout.value.cols);
const thumbSize = computed(() => gridLayout.value.thumbSize);
const rowHeight = computed(() => gridLayout.value.rowHeight);
const allFiles = computed<MediaFile[]>(() => displayGroups.value[0]?.files ?? []);
const totalRows = computed(() => Math.ceil(allFiles.value.length / cols.value));
const totalHeight = computed(() => totalRows.value * rowHeight.value);

const startRow = computed(() => Math.max(0, Math.floor(scrollTop.value / rowHeight.value) - BUFFER_ROWS));
const endRow = computed(() => Math.min(totalRows.value, Math.ceil((scrollTop.value + viewportHeight.value) / rowHeight.value) + BUFFER_ROWS));
const startIdx = computed(() => startRow.value * cols.value);
const endIdx = computed(() => endRow.value * cols.value);
const visibleFiles = computed<MediaFile[]>(() => allFiles.value.slice(startIdx.value, endIdx.value));

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

// 切换目录时回到顶部，避免沿用旧 scrollTop 导致可视区错位
watch(selectedDirKey, () => {
  scrollTop.value = 0;
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
      <aside class="album-sidebar" :style="{ width: `${sidebarWidth}px` }">
        <div class="sidebar-header">
          <span>目录</span>
          <div class="sidebar-actions">
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
        <a-tree
          v-model:expanded-keys="expandedKeys"
          :selected-keys="selectedDirKey ? [selectedDirKey] : []"
          :tree-data="treeData"
          :switcher-icon="albumTreeSwitcherIcon"
          show-icon
          block-node
          @select="onTreeSelect"
        >
          <template #title="{ key, title }">
            <a-dropdown :trigger="['contextmenu']" :disabled="!inTauri">
              <span class="tree-node-title" @contextmenu.prevent.stop>{{ title }}</span>
              <template #overlay>
                <a-menu>
                  <a-menu-item key="open-folder" @click="openAlbumDirInExplorer(String(key))"> 在资源管理器中打开 </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </template>
        </a-tree>
      </aside>

      <div
        class="sidebar-resize-handle"
        :class="{ 'is-active': sidebarResizing }"
        title="拖拽调整宽度，双击恢复默认"
        @pointerdown="onSidebarResizeStart"
        @pointermove="onSidebarResizeMove"
        @pointerup="onSidebarResizeEnd"
        @pointercancel="onSidebarResizeEnd"
        @dblclick="resetSidebarWidth"
      />

      <main class="album-main">
        <div v-if="thumbsGenerating" class="thumb-progress-bar">
          <span>{{ scanProgressLabel }}</span>
          <a-progress :percent="scanProgressPercent" size="small" :show-info="false" class="thumb-progress-track" />
        </div>

        <div ref="scrollEl" class="album-scroll">
          <a-empty v-if="displayGroups.length === 0" description="该目录下无媒体文件" class="state-empty-inline" />
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
      </main>
    </div>

    <MediaViewer
      v-if="viewerState"
      :groups="displayGroups"
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
  gap: 0;
  border-top: 1px solid var(--border-color);
}

.album-sidebar {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  background: var(--bg-color);
}

.sidebar-resize-handle {
  width: 1px;
  background: var(--border-color);

  &:hover,
  &.is-active {
    width: 3px;
    flex-shrink: 0;
    margin-left: -1px;
    margin-right: -1px;
    cursor: col-resize;
    touch-action: none;
    position: relative;
    z-index: 2;
    background: color-mix(in srgb, var(--color-primary) 35%, transparent);
  }
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 10px 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  letter-spacing: 0.06em;
}

.sidebar-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.album-sidebar :deep(.ant-tree) {
  background: transparent;
  color: var(--color-text);
  padding: 0 6px 10px;
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
}

.album-sidebar :deep(.ant-tree .ant-tree-indent-unit) {
  width: 12px;
}

.album-sidebar :deep(.ant-tree .ant-tree-treenode) {
  display: flex;
  align-items: center;
  width: 100%;
}

/* 有/无展开箭头均保留同宽占位，末级文字与上级对齐 */
.album-sidebar :deep(.ant-tree .ant-tree-switcher) {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  min-width: 20px;
  height: 24px;
}

.album-sidebar :deep(.ant-tree .ant-tree-switcher-noop) {
  visibility: hidden;
  pointer-events: none;
}

.album-sidebar :deep(.ant-tree .ant-tree-switcher svg) {
  width: 16px;
  height: 16px;
}

.album-sidebar :deep(.ant-tree .ant-tree-node-content-wrapper) {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  border-radius: 4px;
  overflow: hidden;
}

.album-sidebar :deep(.ant-tree .ant-tree-title) {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-node-title {
  display: block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.album-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
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
</style>

<!-- 拖拽侧栏时禁止选中文字并固定光标（挂在 body，需非 scoped） -->
<style lang="scss">
body.album-sidebar-resizing {
  cursor: col-resize !important;
  user-select: none !important;
}
</style>
