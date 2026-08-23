<!--
  相册主页 — 左侧目录树 + 右侧资源宫格
  职责：扫描根目录、按子目录筛选展示；缩略图路径 + 后台增量生成
-->
<script setup lang="ts">
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import MediaViewer from "./MediaViewer.vue";

const ALBUM_SCAN_PROGRESS_EVENT = "album://scan-progress";
const ALBUM_THUMB_READY_EVENT = "album://thumb-ready";
const ALBUM_FILES_CHANGED_EVENT = "album://files-changed";

interface AlbumScanProgressPayload {
  phase: "discover" | "thumbnails" | string;
  done: number;
  total: number;
}

interface AlbumThumbReadyPayload {
  path: string;
  thumbPath?: string;
  previewPath?: string;
}

interface MediaFile {
  path: string;
  name: string;
  kind: "image" | "video" | "livephoto";
  size: number;
  modified: number;
  ext: string;
  thumbPath?: string;
  previewPath?: string;
  videoPath?: string;
}

interface MediaGroup {
  dirName: string;
  dirPath: string;
  relPath: string;
  files: MediaFile[];
}

defineOptions({ name: "AlbumGallery" });

const router = useRouter();

const groups = ref<MediaGroup[]>([]);
const rootDir = ref("");
const THUMB_SIZE = 158;
const GRID_COLS = 5;
const loading = ref(false);
const error = ref("");
const scanProgress = ref<AlbumScanProgressPayload>({ phase: "discover", done: 0, total: 0 });
const viewerState = ref<{ groupIdx: number; fileIdx: number } | null>(null);
const selectedDirKey = ref("");

/** 默认选中根目录分组（relPath "."），无则取第一项 */
function defaultDirKey(list: MediaGroup[]): string {
  const root = list.find(g => g.relPath === ".");
  return root?.relPath ?? list[0]?.relPath ?? "";
}

const treeData = computed(() =>
  groups.value.map(g => ({
    key: g.relPath,
    title: `${g.dirName} (${g.files.length})`,
    isLeaf: true
  }))
);

/** 当前选中的单个目录分组（供宫格与查看器） */
const displayGroups = computed<MediaGroup[]>(() => {
  const group = groups.value.find(g => g.relPath === selectedDirKey.value);
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
    selectedDirKey.value = key;
  }
}

function applyThumbReady(payload: AlbumThumbReadyPayload) {
  for (const group of groups.value) {
    const file = group.files.find(f => f.path === payload.path);
    if (!file) continue;
    if (payload.thumbPath) file.thumbPath = payload.thumbPath;
    if (payload.previewPath) file.previewPath = payload.previewPath;
    break;
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

async function scan() {
  if (!rootDir.value) return;
  loading.value = true;
  error.value = "";
  groups.value = [];
  selectedDirKey.value = "";
  scanProgress.value = { phase: "discover", done: 0, total: 0 };
  try {
    await invoke("album_cancel_scan");
    const result = await invoke<MediaGroup[]>("album_scan", {
      root: rootDir.value,
      thumbSize: THUMB_SIZE
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

let unlistenScanProgress: (() => void) | undefined;
let unlistenThumbReady: (() => void) | undefined;
let unlistenFilesChanged: (() => void) | undefined;

onMounted(async () => {
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

  unlistenFilesChanged = await listen(ALBUM_FILES_CHANGED_EVENT, () => {
    scan();
  });

  await loadSettings();
  if (rootDir.value) {
    await scan();
  }
});

onBeforeUnmount(() => {
  unlistenScanProgress?.();
  unlistenThumbReady?.();
  unlistenFilesChanged?.();
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
      <button class="state-action" @click="router.push('/album/settings')">前往设置</button>
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
      <button class="state-action" @click="scan">重试</button>
    </div>

    <div v-else-if="groups.length === 0" class="state-empty">
      <p class="state-text">未找到媒体文件</p>
    </div>

    <div v-else class="album-layout">
      <aside class="album-sidebar">
        <div class="sidebar-header">目录</div>
        <a-tree
          :selected-keys="[selectedDirKey]"
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

        <div class="album-scroll">
          <div v-if="displayGroups.length === 0" class="state-empty-inline">该目录下无媒体文件</div>
          <div v-else class="thumb-grid" :style="{ '--thumb-size': THUMB_SIZE + 'px', '--grid-cols': GRID_COLS }">
            <template v-for="group in displayGroups" :key="group.relPath">
              <div
                v-for="file in group.files"
                :key="file.path"
                class="thumb-card"
                @click="openViewer(file)"
              >
                <img
                  v-if="thumbSrc(file) && (file.kind === 'image' || file.kind === 'livephoto')"
                  :src="thumbSrc(file)"
                  class="thumb-img"
                  decoding="async"
                  alt=""
                />
                <div v-else-if="file.kind === 'image' || file.kind === 'livephoto'" class="thumb-video-placeholder">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                  <span class="thumb-ext">{{ file.ext.toUpperCase() }}</span>
                </div>
                <div v-else class="thumb-video-placeholder">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span class="thumb-ext">{{ file.ext.toUpperCase() }}</span>
                </div>
                <span v-if="file.kind === 'livephoto'" class="badge-live">Live</span>
                <span v-if="file.kind === 'video'" class="badge-video">{{ file.ext.toUpperCase() }}</span>
              </div>
            </template>
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
  </div>
</template>

<style scoped lang="scss">
.album-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #14171c;
}

.album-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.album-sidebar {
  width: 158px;
  flex-shrink: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #14171c;
}

.sidebar-header {
  padding: 10px 10px 6px;
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.38);
  letter-spacing: 0.06em;
}

.album-sidebar :deep(.ant-tree) {
  background: transparent;
  color: rgba(255, 255, 255, 0.82);
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
  background: rgba(255, 255, 255, 0.06);
}

.album-sidebar :deep(.ant-tree-node-content-wrapper.ant-tree-node-selected) {
  background: rgba(22, 136, 255, 0.22);
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
  color: rgba(255, 255, 255, 0.55);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
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
  color: rgba(255, 255, 255, 0.45);
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
  background: #1688ff;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  &:hover {
    background: #0e7ae6;
  }
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: #1688ff;
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
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.scan-progress-bar {
  height: 100%;
  background: #1688ff;
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
  padding: 12px;
  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
  }
}

.thumb-grid {
  display: grid;
  grid-template-columns: repeat(var(--grid-cols, 5), var(--thumb-size, 158px));
  gap: 8px;
  justify-content: start;
}

.thumb-card {
  width: var(--thumb-size, 158px);
  height: var(--thumb-size, 158px);
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  background: #25292e;
  position: relative;
  content-visibility: auto;
  contain-intrinsic-size: var(--thumb-size, 160px);
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
  background: #1a1d23;
}

.thumb-ext {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.3);
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
</style>
