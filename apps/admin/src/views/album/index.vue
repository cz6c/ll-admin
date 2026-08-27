<!--
  相册主页 — 左侧目录树 + 右侧资源宫格
  职责：扫描根目录、按子目录筛选展示；缩略图路径 + 后台增量生成
-->
<script setup lang="ts">
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useElementSize, useScroll } from "@vueuse/core";
import MediaViewer from "./MediaViewer.vue";
import IcloudSyncFab from "./IcloudSyncFab.vue";
import {
  ALBUM_SCAN_PROGRESS_EVENT,
  ALBUM_THUMB_READY_EVENT,
  type AlbumScanProgressPayload,
  type AlbumThumbReadyPayload,
  type MediaFile,
  type MediaGroup
} from "./types";

defineOptions({ name: "AlbumGallery" });

const router = useRouter();

const groups = ref<MediaGroup[]>([]);
const rootDir = ref("");
const THUMB_SIZE = 158;
const GAP = 8;
const BUFFER_ROWS = 4;
const loading = ref(false);
const error = ref("");
const scanProgress = ref<AlbumScanProgressPayload>({ phase: "discover", done: 0, total: 0 });
const viewerState = ref<{ groupIdx: number; fileIdx: number } | null>(null);
const selectedDirKey = ref("");

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
  isLeaf?: boolean;
}

/** 统一 relPath 分隔符，避免 Windows `\` 与树节点 key 不一致 */
function normalizeRelPath(rel: string): string {
  if (!rel || rel === ".") return ".";
  return rel.replace(/\\/g, "/").replace(/\/+$/, "") || ".";
}

/** 默认选中根目录分组（relPath "."），无则取第一项 */
function defaultDirKey(list: MediaGroup[]): string {
  const root = list.find(g => normalizeRelPath(g.relPath) === ".");
  return root ? "." : normalizeRelPath(list[0]?.relPath ?? "");
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
    const kids = [...n.children.values()]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
      .map(toNode);
    const count = fileCount.get(n.key) ?? 0;
    return {
      key: n.key,
      title: `${n.name} (${count})`,
      children: kids.length ? kids : undefined,
      isLeaf: kids.length === 0
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
  if (phase === "thumbnails" && total > 0) {
    return Math.min(100, Math.round((done / total) * 100));
  }
  if (phase === "discover" && scanProgress.value.total > 0) {
    return 100;
  }
  return 0;
});

const scanProgressLabel = computed(() => {
  const { phase, done, total } = scanProgress.value;
  if (phase === "thumbnails" && total > 0) {
    return `生成缩略图 ${done} / ${total}`;
  }
  if (done > 0) {
    return `扫描文件 ${done}${total > 0 ? ` / ${total}` : ""}`;
  }
  return "扫描中...";
});

const thumbsGenerating = computed(
  () => scanProgress.value.phase === "thumbnails" && scanProgress.value.total > scanProgress.value.done
);

function thumbSrc(file: MediaFile): string | undefined {
  if (!file.thumbPath) return undefined;
  return convertFileSrc(file.thumbPath);
}

function onTreeSelect(keys: string[]) {
  const key = keys[0];
  if (key) {
    selectedDirKey.value = normalizeRelPath(key);
  }
}

function applyThumbReady(payload: AlbumThumbReadyPayload) {
  const pos = pathIndex.value.get(payload.path);
  if (!pos) return;
  const file = groups.value[pos.groupIdx]?.files?.[pos.fileIdx];
  if (!file) return;
  if (payload.thumbPath) file.thumbPath = payload.thumbPath;
  if (payload.previewPath) file.previewPath = payload.previewPath;
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
      thumbSize: THUMB_SIZE,
      force
    });
    groups.value = result;
    selectedDirKey.value = defaultDirKey(result);
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

// ===== 虚拟滚动：仅渲染可视区 + 上下缓冲的卡片，大相册不爆 DOM =====
const scrollEl = ref<HTMLElement | null>(null);
const { width: containerWidth, height: viewportHeight } = useElementSize(scrollEl);
const { y: scrollTop } = useScroll(scrollEl, { throttle: 60 });

const cols = computed(() =>
  Math.max(1, Math.floor((containerWidth.value + GAP) / (THUMB_SIZE + GAP)))
);
const allFiles = computed<MediaFile[]>(() => displayGroups.value[0]?.files ?? []);
const rowHeight = THUMB_SIZE + GAP;
const totalRows = computed(() => Math.ceil(allFiles.value.length / cols.value));
const totalHeight = computed(() => totalRows.value * rowHeight);

const startRow = computed(() =>
  Math.max(0, Math.floor(scrollTop.value / rowHeight) - BUFFER_ROWS)
);
const endRow = computed(() =>
  Math.min(totalRows.value, Math.ceil((scrollTop.value + viewportHeight.value) / rowHeight) + BUFFER_ROWS)
);
const startIdx = computed(() => startRow.value * cols.value);
const endIdx = computed(() => endRow.value * cols.value);
const visibleFiles = computed<MediaFile[]>(() => allFiles.value.slice(startIdx.value, endIdx.value));

function cardStyle(idx: number): Record<string, string> {
  const col = idx % cols.value;
  const row = Math.floor(idx / cols.value);
  return {
    left: `${col * (THUMB_SIZE + GAP)}px`,
    top: `${row * rowHeight}px`,
    width: `${THUMB_SIZE}px`,
    height: `${THUMB_SIZE}px`
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
    <div v-if="!rootDir && !loading" class="state-empty">
      <div class="state-icon-box">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 7h6l2 2h10v10a2 2 0 0 1-2 2H3z" />
        </svg>
      </div>
      <p class="state-text">未设置相册根目录</p>
      <button class="state-action" @click="router.push('/cs-settings')">前往设置</button>
    </div>

    <div v-else-if="loading" class="state-loading">
      <div class="spinner" />
      <p class="state-text">{{ scanProgressLabel }}</p>
      <div class="scan-progress-wrap">
        <div
          class="scan-progress-bar"
          :class="{ indeterminate: scanProgress.phase === 'discover' && scanProgress.total === 0 }"
          :style="scanProgress.phase === 'thumbnails' && scanProgress.total > 0 ? { width: scanProgressPercent + '%' } : undefined"
        />
      </div>
    </div>

    <div v-else-if="error" class="state-error">
      <p class="state-text">{{ error }}</p>
      <button class="state-action" @click="scan(true)">重试</button>
    </div>

    <div v-else-if="groups.length === 0" class="state-empty">
      <p class="state-text">未找到媒体文件</p>
    </div>

    <div v-else class="album-layout">
      <aside class="album-sidebar">
        <div class="sidebar-header">
          <span>目录</span>
          <button
            class="refresh-btn"
            :class="{ spinning: loading }"
            :disabled="loading"
            title="刷新相册（强制重扫磁盘）"
            @click="scan(true)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </button>
        </div>
        <a-tree
          v-model:expanded-keys="expandedKeys"
          :selected-keys="selectedDirKey ? [selectedDirKey] : []"
          :tree-data="treeData"
          block-node
          @select="onTreeSelect"
        />
      </aside>

      <main class="album-main">
        <div v-if="thumbsGenerating" class="thumb-progress-bar">
          <span>{{ scanProgressLabel }}</span>
          <div class="scan-progress-wrap compact">
            <div class="scan-progress-bar" :style="{ width: scanProgressPercent + '%' }" />
          </div>
        </div>

        <div ref="scrollEl" class="album-scroll">
          <div v-if="displayGroups.length === 0" class="state-empty-inline">该目录下无媒体文件</div>
          <div v-else class="thumb-canvas" :style="{ height: totalHeight + 'px' }">
            <div
              v-for="(file, i) in visibleFiles"
              :key="file.path"
              class="thumb-card"
              :style="cardStyle(startIdx + i)"
              @click="openViewer(file)"
            >
              <img
                v-if="thumbSrc(file)"
                :src="thumbSrc(file)"
                class="thumb-img"
                loading="lazy"
                decoding="async"
                alt=""
              />
              <div v-else-if="file.kind === 'image' || file.kind === 'livephoto'" class="thumb-video-placeholder">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" stroke-width="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                <span class="thumb-ext">{{ file.ext.toUpperCase() }}</span>
              </div>
              <div v-else class="thumb-video-placeholder">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(0,0,0,0.5)">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span class="thumb-ext">{{ file.ext.toUpperCase() }}</span>
              </div>
              <span v-if="file.kind === 'livephoto'" class="badge-live">Live</span>
              <span v-if="file.kind === 'video'" class="badge-video">{{ file.ext.toUpperCase() }}</span>
              <div v-if="file.kind === 'video' && thumbSrc(file)" class="video-play-overlay">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="rgba(255,255,255,0.92)">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
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
  width: 158px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-color);
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

.refresh-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  &:hover:not(:disabled) {
    background: var(--fill-color);
    color: var(--color-text);
  }
  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
  &.spinning svg {
    animation: refresh-spin 0.9s linear infinite;
  }
}

@keyframes refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

.album-sidebar :deep(.ant-tree) {
  background: transparent;
  color: var(--color-text);
  padding: 0 6px 10px;
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  font-size: 12px;
}

.album-sidebar :deep(.ant-tree-node-content-wrapper) {
  padding: 0 4px;
  border-radius: 4px;
  min-width: 0;
}

.album-sidebar :deep(.ant-tree-node-content-wrapper:hover) {
  background: var(--fill-color);
}

.album-sidebar :deep(.ant-tree-node-content-wrapper.ant-tree-node-selected) {
  background: color-mix(in srgb, var(--color-primary) 22%, transparent);
  color: #fff;
}

.album-sidebar :deep(.ant-tree-title) {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.album-sidebar :deep(.ant-tree-switcher) {
  width: 16px;
  line-height: 22px;
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
  .scan-progress-wrap.compact {
    flex: 1;
    max-width: 200px;
    margin-top: 0;
  }
}

.state-empty,
.state-loading,
.state-error {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.state-empty-inline {
  padding: 48px;
  text-align: center;
  color: var(--color-text-tertiary);
  font-size: 14px;
}

.state-text {
  margin: 0;
  font-size: 14px;
}

.state-action {
  height: 34px;
  padding: 0 20px;
  border: 0;
  border-radius: 6px;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  &:hover {
    background: color-mix(in srgb, var(--color-primary), #000 12%);
  }
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--fill-color);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.scan-progress-wrap {
  width: min(320px, 80vw);
  height: 8px;
  margin-top: 4px;
  border-radius: 4px;
  background: var(--fill-color);
  overflow: hidden;
}

.scan-progress-bar {
  height: 100%;
  background: var(--color-primary);
  border-radius: 4px;
  transition: width 0.15s ease;
  &.indeterminate {
    width: 40% !important;
    animation: scan-indeterminate 1.2s ease-in-out infinite;
  }
}

@keyframes scan-indeterminate {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(260%);
  }
}

.album-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px;
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

.thumb-card {
  position: absolute;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  background: var(--fill-color);
  &:hover .thumb-img {
    opacity: 0.85;
  }
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.thumb-video-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: var(--fill-color);
}

.thumb-ext {
  font-size: 10px;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
}

.badge-live {
  position: absolute;
  top: 4px;
  left: 4px;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.65);
  color: #4ade80;
  font-size: 10px;
  font-weight: 600;
}

.badge-video {
  position: absolute;
  top: 4px;
  left: 4px;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.65);
  color: rgba(255, 255, 255, 0.7);
  font-size: 10px;
  font-weight: 600;
}

.video-play-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.35));
}
</style>
