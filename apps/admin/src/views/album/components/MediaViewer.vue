<!--
  本地相册全屏预览灯箱
  职责：图/视频/实况预览；Esc/方向键；缩放顶栏（静态图/Live）+ 信息/删除；底栏胶片条（含左右切）
  适用：album/index.vue（同步抽屉不提供灯箱）
  @note Teleport body，z-index 9999；信息 Tooltip 须 z-index>9999；删除确认须配合 feedback-confirm-fullscreen
-->
<script setup lang="ts">
import LivePhotoPlayer from "./LivePhotoPlayer.vue";
import MediaPreviewZoom from "./MediaPreviewZoom.vue";
import MediaViewerFilmstrip from "./MediaViewerFilmstrip.vue";
import { useAlbumPlaybackSrc } from "@/composables/useAlbumPlayback";
import { isTauri } from "@/utils/tauri";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useEventListener } from "@vueuse/core";
import dayjs from "dayjs";
import type { FlatFile, MediaFile, MediaGroup } from "../types";

const props = defineProps<{
  groups: MediaGroup[];
  initialGroupIdx: number;
  initialFileIdx: number;
}>();

const emit = defineEmits<{
  close: [filePath?: string];
  /** 删除当前项；父页确认并删盘后刷新列表，本组件按列表收缩夹索引 */
  delete: [file: MediaFile];
}>();

defineOptions({ name: "MediaViewer" });

/** CS 桌面端才可删本地盘文件 */
const inTauri = isTauri();

const currentIndex = ref(0);
/** 缩放工具栏 Teleport 挂载点 */
const zoomToolbarRef = ref<HTMLElement | null>(null);
// 加载失败占位：切换时重置，避免上一张的失败态延续到下一张
const loadFailed = ref(false);

const flatFiles = computed<FlatFile[]>(() => {
  const result: FlatFile[] = [];
  for (const group of props.groups) {
    for (const file of group.files) {
      result.push({ file, groupName: group.dirName });
    }
  }
  return result;
});

const current = computed<FlatFile | null>(() => flatFiles.value[currentIndex.value] ?? null);

const canPrev = computed(() => currentIndex.value > 0);
const canNext = computed(() => currentIndex.value < flatFiles.value.length - 1);

const currentVideoPath = computed(() => {
  const file = current.value?.file;
  return file?.kind === "video" ? file.path : undefined;
});
const {
  playbackSrc: videoPlaybackSrc,
  width: videoPlaybackWidth,
  height: videoPlaybackHeight,
  loading: videoPlaybackLoading,
  error: videoPlaybackError
} = useAlbumPlaybackSrc(currentVideoPath);

function calcInitialIndex(): number {
  let idx = 0;
  for (let g = 0; g < props.initialGroupIdx && g < props.groups.length; g++) {
    idx += props.groups[g].files.length;
  }
  idx += props.initialFileIdx;
  return Math.min(Math.max(0, idx), Math.max(0, flatFiles.value.length - 1));
}

function prev() {
  if (canPrev.value) currentIndex.value--;
}

function next() {
  if (canNext.value) currentIndex.value++;
}

/** 胶片条点击：直接跳到目标索引（邻域窗口内） */
function goToIndex(index: number) {
  if (index < 0 || index >= flatFiles.value.length) return;
  currentIndex.value = index;
}

function close() {
  emit("close", current.value?.file.path);
}

function getMediaSrc(path: string): string {
  return convertFileSrc(path);
}

function isHeifFile(file: MediaFile): boolean {
  return file.ext === "heic" || file.ext === "heif";
}

/** 图片预览：HEIC/HEIF 用扫描阶段生成的全尺寸缓存 */
function imagePreviewSrc(file: MediaFile): string {
  if (isHeifFile(file) && file.previewPath) {
    return getMediaSrc(file.previewPath);
  }
  return getMediaSrc(file.path);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + " GB";
}

/** 拍摄时间展示；无效/空则不显示 */
function formatCaptureAt(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const d = dayjs(s);
  return d.isValid() ? d.format("YYYY-MM-DD HH:mm") : s;
}

/** 相对相册根目录展示；`.` / 空 → 根目录（与改拍摄时间弹窗一致） */
function formatDirLabel(rel?: string): string {
  const n = (rel ?? ".").trim().replace(/\\/g, "/") || ".";
  return n === "." || n === "" ? "根目录" : n;
}

const captureLabel = computed(() => formatCaptureAt(current.value?.file.captureAt));

const cameraLabel = computed(() => {
  const s = (current.value?.file.camera ?? "").trim();
  return s || null;
});

/** 分辨率：图/Live 用文件字段；单独视频优先打开时 ffprobe 结果 */
const resolutionLabel = computed(() => {
  const file = current.value?.file;
  if (!file) return null;
  if (file.kind === "video") {
    const w = videoPlaybackWidth.value ?? file.width;
    const h = videoPlaybackHeight.value ?? file.height;
    if (!w || !h) return null;
    return `${w}×${h}`;
  }
  const w = file.width;
  const h = file.height;
  if (!w || !h) return null;
  return `${w}×${h}`;
});

const infoTitle = computed(() => current.value?.file.name ?? "");

/** 静态图/Live 静帧可缩放；单独视频走原生 controls */
const previewZoomable = computed(() => {
  const kind = current.value?.file.kind;
  return kind === "image" || kind === "livephoto";
});

/** 文件信息 tooltip：label:value 一行一项；空值字段不展示；不含 n/total */
const infoRows = computed<{ label: string; value: string }[]>(() => {
  const file = current.value?.file;
  if (!file) return [];
  const rows: { label: string; value: string }[] = [];
  rows.push({ label: "所在目录", value: formatDirLabel(file.relDir) });
  if (file.name) rows.push({ label: "文件名", value: file.name });
  if (captureLabel.value) rows.push({ label: "拍摄时间", value: captureLabel.value });
  if (cameraLabel.value) rows.push({ label: "设备", value: cameraLabel.value });
  if (resolutionLabel.value) rows.push({ label: "分辨率", value: resolutionLabel.value });
  rows.push({ label: "大小", value: formatSize(file.size) });
  return rows;
});

// 单独视频打开后把分辨率写回内存，便于同会话内切回仍显示
watch([videoPlaybackWidth, videoPlaybackHeight, current], () => {
  const file = current.value?.file;
  if (!file || file.kind !== "video") return;
  if (videoPlaybackWidth.value) file.width ??= videoPlaybackWidth.value;
  if (videoPlaybackHeight.value) file.height ??= videoPlaybackHeight.value;
});

function onMediaError() {
  loadFailed.value = true;
}

// 切换媒体时重置失败态
watch(currentIndex, () => {
  loadFailed.value = false;
});

/**
 * 父页删盘后 groups 收缩：空则关灯箱；索引越界夹到末张
 * 删当前项时同索引自然落到原下一张
 */
watch(
  () => flatFiles.value.length,
  len => {
    if (len === 0) {
      emit("close");
      return;
    }
    if (currentIndex.value >= len) currentIndex.value = len - 1;
  }
);

/** 顶栏删除：交给父页走与宫格右键相同的确认/删盘 */
function onToolbarDelete() {
  const file = current.value?.file;
  if (!file || !inTauri) return;
  emit("delete", file);
}

function onKeydown(e: KeyboardEvent) {
  switch (e.key) {
    case "Escape":
      e.preventDefault();
      e.stopPropagation();
      close();
      break;
    case "ArrowLeft":
      if (canPrev.value) prev();
      break;
    case "ArrowRight":
      if (canNext.value) next();
      break;
    default:
      break;
  }
}

useEventListener(window, "keydown", onKeydown, { capture: true });

onMounted(() => {
  currentIndex.value = calcInitialIndex();
});
</script>

<template>
  <Teleport to="body">
    <div class="viewer-overlay" role="dialog" aria-modal="true" :aria-label="infoTitle || '预览'" @click="close">
      <div class="viewer-top-toolbar" @click.stop @dblclick.stop>
        <!-- 居中：缩放 + 信息/删除；关闭仍在右上角原位，只是归属顶栏 -->
        <div class="viewer-top-toolbar__center">
          <div ref="zoomToolbarRef" class="viewer-top-toolbar__zoom" />
          <div class="viewer-top-toolbar__extra">
            <!-- z-index 须 > overlay(9999)：Tooltip 默认挂 body，层级约 1030 会被灯箱挡住；勿挂 overlay 内（overflow:hidden 会裁切） -->
            <a-tooltip placement="bottomLeft" :mouse-enter-delay="0.15" :z-index="10050">
              <template #title>
                <div class="viewer-info-tip">
                  <div v-for="row in infoRows" :key="row.label" class="viewer-info-tip__row">
                    <span class="viewer-info-tip__label">{{ row.label }}：</span>
                    <span class="viewer-info-tip__value">{{ row.value }}</span>
                  </div>
                </div>
              </template>
              <a-button type="text" aria-label="文件信息" :disabled="infoRows.length === 0">
                <template #icon>
                  <CcIconifyIcon icon="ant-design:info-circle-outlined" width="20" height="20" />
                </template>
              </a-button>
            </a-tooltip>
            <a-button type="text" title="删除本地" aria-label="删除本地" :disabled="!inTauri" @click="onToolbarDelete">
              <template #icon>
                <CcIconifyIcon icon="ant-design:delete-outlined" width="20" height="20" />
              </template>
            </a-button>
          </div>
        </div>
        <a-button class="viewer-top-toolbar__close" shape="circle" type="text" title="关闭 (Esc)" aria-label="关闭" @click="close">
          <template #icon>
            <CcIconifyIcon icon="ant-design:close-outlined" width="20" height="20" />
          </template>
        </a-button>
      </div>

      <div class="viewer-content" @click.stop>
        <MediaPreviewZoom v-if="previewZoomable" class="viewer-zoom-wrap" :active="true" :reset-key="current?.file.path" :toolbar-target="zoomToolbarRef">
          <template v-if="current">
            <a-result v-if="loadFailed" status="error" title="无法加载该文件" :sub-title="current.file.name" class="viewer-result" />

            <CcImage
              v-else-if="current.file.kind === 'image'"
              class="viewer-media viewer-img"
              :src="imagePreviewSrc(current.file)"
              fit="contain"
              width="auto"
              height="auto"
              max-width="var(--viewer-media-max-w)"
              max-height="var(--viewer-media-max-h)"
              :lazy="true"
            />

            <div v-else-if="current.file.kind === 'livephoto'" class="live-container">
              <LivePhotoPlayer
                :key="current.file.path"
                :photo-path="current.file.path"
                :video-path="current.file.videoPath || ''"
                :photo-preview-path="current.file.previewPath"
                :playback-path="current.file.playbackPath"
              />
            </div>
          </template>
        </MediaPreviewZoom>

        <template v-else-if="current">
          <a-result v-if="loadFailed" status="error" title="无法加载该文件" :sub-title="current.file.name" class="viewer-result" />

          <div v-else-if="current.file.kind === 'video'" class="video-container">
            <a-spin v-if="videoPlaybackLoading" tip="正在准备播放…" />
            <a-result v-else-if="videoPlaybackError" status="error" :title="videoPlaybackError" :sub-title="current.file.name" class="viewer-result" />
            <video
              v-else-if="videoPlaybackSrc"
              :key="videoPlaybackSrc"
              :src="videoPlaybackSrc"
              controls
              autoplay
              playsinline
              class="viewer-media viewer-video"
              @error="onMediaError"
            />
          </div>
        </template>
      </div>

      <MediaViewerFilmstrip
        v-if="flatFiles.length > 0"
        :files="flatFiles"
        :current-index="currentIndex"
        :can-prev="canPrev"
        :can-next="canNext"
        @select="goToIndex"
        @prev="prev"
        @next="next"
      />
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.viewer-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  /* 相册灯箱深底衬媒体，避免浅罩抢对比 */
  background: var(--color-bg-spotlight);
  /* 内容区只相对顶栏 / 底栏预留；左右切已并入胶片条，侧向仅留小边距 */
  --viewer-side-gutter: 16px;
  --viewer-top-gutter: 52px;
  --viewer-bottom-gutter: 80px; /* 胶片条 + 两侧导航 */
  /* 媒体上限与内容区同尺寸（用明确 calc，避免缩放层百分比循环导致裁切） */
  --viewer-media-max-w: calc(100vw - 2 * var(--viewer-side-gutter));
  --viewer-media-max-h: calc(100vh - var(--viewer-top-gutter) - var(--viewer-bottom-gutter));
}
.viewer-top-toolbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
  height: var(--viewer-top-gutter);
  pointer-events: none;
}
.viewer-top-toolbar__center {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: auto;
}
.viewer-top-toolbar__zoom:empty {
  display: none;
}
.viewer-top-toolbar__extra {
  display: flex;
  align-items: center;
  padding: 2px 4px;
  border-radius: 8px;
  background: var(--color-overlay-hover);
  backdrop-filter: blur(6px);

  :deep(.ant-btn) {
    color: var(--color-text-secondary);
    &:hover:not(:disabled) {
      color: var(--color-text-light-solid);
      background: var(--color-fill);
    }
  }

  /* 删除保留危险色 hover，与信息按钮区分 */
  :deep(.ant-btn[aria-label="删除本地"]:hover:not(:disabled)) {
    color: var(--color-error);
  }
}
/* 关闭仍在右上角原位（top 12 / right 16 / 40 圆钮），仅 DOM 归入顶栏 */
.viewer-top-toolbar__close {
  position: absolute;
  top: 6px;
  right: 16px;
  width: 40px;
  height: 40px;
  pointer-events: auto;
  background: var(--color-overlay-hover);
  color: var(--color-text-secondary);

  &:hover {
    background: var(--color-fill);
    color: var(--color-text-light-solid);
  }
}
.viewer-zoom-wrap {
  width: 100%;
  height: 100%;
}
.viewer-content {
  width: calc(100vw - 2 * var(--viewer-side-gutter));
  max-width: calc(100vw - 2 * var(--viewer-side-gutter));
  height: calc(100vh - var(--viewer-top-gutter) - var(--viewer-bottom-gutter));
  max-height: calc(100vh - var(--viewer-top-gutter) - var(--viewer-bottom-gutter));
  margin-top: var(--viewer-top-gutter);
  margin-bottom: var(--viewer-bottom-gutter);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.viewer-info-tip {
  max-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.viewer-info-tip__row {
  display: flex;
  align-items: flex-start;
  gap: 0;
  line-height: 1.4;
  word-break: break-all;
}
.viewer-info-tip__label {
  /* 固定宽右对齐，冒号纵向齐平（最长「所在目录」/「拍摄时间」+ 冒号） */
  flex: 0 0 5em;
  width: 5em;
  text-align: right;
  opacity: 0.85;
}
.viewer-info-tip__value {
  flex: 1 1 auto;
  min-width: 0;
}
.viewer-media {
  /* 上限 = 内容区；宽高 auto + contain → 等比缩放入框，不裁切 */
  max-width: var(--viewer-media-max-w);
  max-height: var(--viewer-media-max-h);
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 4px;
}
.viewer-img {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: var(--viewer-media-max-w);
  max-height: var(--viewer-media-max-h);

  /* CcImage 默认会把 img 拉满 100%，灯箱内改为 intrinsic + 上限，保证整图可见 */
  &.base-image,
  :deep(.base-image),
  :deep(.ant-image),
  :deep(.ant-image-img) {
    width: auto !important;
    height: auto !important;
    max-width: var(--viewer-media-max-w);
    max-height: var(--viewer-media-max-h);
    object-fit: contain;
  }
}
.viewer-result {
  padding: 24px 0;
  :deep(.ant-result-subtitle) {
    word-break: break-all;
    max-width: var(--viewer-media-max-w);
  }
}
.live-container {
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: var(--viewer-media-max-w);
  max-height: var(--viewer-media-max-h);

  /* 覆盖 LivePhotoPlayer 内遗留的 90vw/85vh，与内容区上限对齐 */
  :deep(.live-photo-player),
  :deep(.live-photo-frame),
  :deep(.live-photo-still),
  :deep(.live-photo-motion) {
    max-width: var(--viewer-media-max-w);
    max-height: var(--viewer-media-max-h);
  }

  :deep(.live-photo-still),
  :deep(.live-photo-motion) {
    width: auto;
    height: auto;
    object-fit: contain;
  }
}
.video-container {
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: var(--viewer-media-max-w);
  max-height: var(--viewer-media-max-h);
}
</style>
