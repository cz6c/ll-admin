<!--
  相册主页 — CSS Grid + base64 data URL + content-visibility
  职责：扫描根目录、按子目录分组展示媒体文件
  支持：图片、视频、实况照片（JPG+MOV 配对）
  性能：缩略图 base64 嵌入扫描结果，零 asset 协议开销；content-visibility 原生虚拟渲染
-->
<script setup lang="ts">
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import MediaViewer from "./MediaViewer.vue";

const ALBUM_SCAN_PROGRESS_EVENT = "album://scan-progress";

interface AlbumScanProgressPayload {
  phase: "discover" | "thumbnails" | string;
  done: number;
  total: number;
}

interface MediaFile {
  path: string;
  name: string;
  kind: "image" | "video" | "livephoto";
  size: number;
  modified: number;
  ext: string;
  thumbData?: string;
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

// --- 状态 ---
const groups = ref<MediaGroup[]>([]);
const rootDir = ref("");
const THUMB_SIZE = 158;
const loading = ref(false);
const error = ref("");
const scanProgress = ref<AlbumScanProgressPayload>({ phase: "discover", done: 0, total: 0 });
const viewerState = ref<{ groupIdx: number; fileIdx: number } | null>(null);

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

// --- 数据加载 ---
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
  scanProgress.value = { phase: "discover", done: 0, total: 0 };
  try {
    const result = await invoke<MediaGroup[]>("album_scan", {
      root: rootDir.value,
      thumbSize: THUMB_SIZE
    });
    groups.value = result;
  } catch (e: any) {
    error.value = typeof e === "string" ? e : "扫描失败";
  } finally {
    loading.value = false;
    scanProgress.value = { phase: "discover", done: 0, total: 0 };
  }
}

// --- 查看器 ---
function openViewer(groupIdx: number, fileIdx: number) {
  viewerState.value = { groupIdx, fileIdx };
}

// --- 生命周期 ---
let unlistenScanProgress: (() => void) | undefined;

onMounted(async () => {
  unlistenScanProgress = await listen<AlbumScanProgressPayload>(ALBUM_SCAN_PROGRESS_EVENT, event => {
    if (event.payload) {
      scanProgress.value = event.payload;
    }
  });

  await loadSettings();
  if (rootDir.value) {
    await scan();
  }
});

onBeforeUnmount(() => {
  unlistenScanProgress?.();
});
</script>

<template>
  <div class="album-page">
    <!-- 未设置根目录 -->
    <div v-if="!rootDir && !loading" class="state-empty">
      <div class="state-icon-box">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 7h6l2 2h10v10a2 2 0 0 1-2 2H3z" />
        </svg>
      </div>
      <p class="state-text">未设置相册根目录</p>
      <button class="state-action" @click="router.push('/album/settings')">前往设置</button>
    </div>

    <!-- 加载中 -->
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

    <!-- 错误 -->
    <div v-else-if="error" class="state-error">
      <p class="state-text">{{ error }}</p>
      <button class="state-action" @click="scan">重试</button>
    </div>

    <!-- 空结果 -->
    <div v-else-if="groups.length === 0" class="state-empty">
      <div class="state-icon-box">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      </div>
      <p class="state-text">未找到媒体文件</p>
    </div>

    <!-- CSS Grid 网格 -->
    <div v-else class="album-scroll">
      <div v-for="(group, gIdx) in groups" :key="group.relPath" class="group">
        <div class="group-header">
          <span class="group-name">{{ group.dirName }}</span>
          <span class="group-count">{{ group.files.length }} 项</span>
        </div>
        <div class="thumb-grid" :style="{ '--thumb-size': THUMB_SIZE + 'px' }">
          <div v-for="(file, fIdx) in group.files" :key="file.path" class="thumb-card" @click="openViewer(gIdx, fIdx)">
            <!-- 图片 / 实况照片：base64 data URL 直接渲染，零协议开销 -->
            <img
              v-if="file.thumbData && (file.kind === 'image' || file.kind === 'livephoto')"
              :src="file.thumbData"
              class="thumb-img"
              decoding="async"
              alt=""
            />

            <!-- 无法解码的图片占位（HEIC/SVG 等） -->
            <div v-else-if="file.kind === 'image' || file.kind === 'livephoto'" class="thumb-video-placeholder">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              <span class="thumb-ext">{{ file.ext.toUpperCase() }}</span>
            </div>

            <!-- 视频占位 -->
            <div v-else class="thumb-video-placeholder">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span class="thumb-ext">{{ file.ext.toUpperCase() }}</span>
            </div>

            <!-- 实况照片标记 -->
            <span v-if="file.kind === 'livephoto'" class="badge-live">Live</span>
            <!-- 视频标记 -->
            <span v-if="file.kind === 'video'" class="badge-video">{{ file.ext.toUpperCase() }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 全屏查看器 -->
    <MediaViewer
      v-if="viewerState"
      :groups="groups"
      :initial-group-idx="viewerState.groupIdx"
      :initial-file-idx="viewerState.fileIdx"
      @close="viewerState = null"
    />
  </div>
</template>

<style scoped lang="scss">
/* 状态页 */
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
.state-icon-box {
  color: rgba(255, 255, 255, 0.2);
}
.state-text {
  margin: 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.45);
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

/* 滚动容器 */
.album-scroll {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    &:hover {
      background: rgba(255, 255, 255, 0.2);
    }
  }
}

/* 分组 */
.group {
  margin-bottom: 16px;
}
.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px 8px;
}
.group-name {
  font-size: 13px;
  font-weight: 600;
}
.group-count {
  font-size: 12px;
}

/* CSS Grid 自适应列数 */
.thumb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, var(--thumb-size, 160px));
  gap: 8px;
  justify-content: start;
}

/* 缩略图卡片 — content-visibility:auto 原生虚拟渲染，跳过屏外卡片的布局和绘制 */
.thumb-card {
  width: var(--thumb-size, 160px);
  height: var(--thumb-size, 160px);
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  background: #25292e;
  position: relative;
  content-visibility: auto;
  contain-intrinsic-size: var(--thumb-size, 160px);
  &:hover {
    .thumb-img {
      opacity: 0.85;
    }
  }
}
.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* 视频/不支持格式占位 */
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

/* 徽标 */
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
  letter-spacing: 0.3px;
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
  letter-spacing: 0.3px;
}
</style>
