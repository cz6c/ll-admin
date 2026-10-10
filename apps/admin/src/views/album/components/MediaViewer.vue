<!--
  本地相册全屏预览灯箱
  职责：图/视频/实况预览；Esc/方向键；缩放顶栏（静态图/Live）+ 删除本地；底栏元信息
  适用：album/index.vue（同步抽屉不提供灯箱）
  @note Teleport body，z-index 9999；删除确认须配合 feedback-confirm-fullscreen
-->
<script setup lang="ts">
import LivePhotoPlayer from "./LivePhotoPlayer.vue";
import MediaPreviewZoom from "./MediaPreviewZoom.vue";
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

const infoMeta = computed(() => {
  if (!current.value) return "";
  const parts: string[] = [];
  if (captureLabel.value) parts.push(captureLabel.value);
  if (cameraLabel.value) parts.push(cameraLabel.value);
  if (resolutionLabel.value) parts.push(resolutionLabel.value);
  parts.push(formatSize(current.value.file.size));
  parts.push(`${currentIndex.value + 1} / ${flatFiles.value.length}`);
  return parts.join(" · ");
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
        <div ref="zoomToolbarRef" class="viewer-top-toolbar__zoom" />
        <div class="viewer-top-toolbar__extra">
          <a-button type="text" title="删除本地" aria-label="删除本地" :disabled="!inTauri" @click="onToolbarDelete">
            <template #icon>
              <CcIconifyIcon icon="ant-design:delete-outlined" width="20" height="20" />
            </template>
          </a-button>
        </div>
      </div>

      <a-button class="viewer-close" shape="circle" type="text" title="关闭 (Esc)" @click.stop="close">
        <template #icon>
          <CcIconifyIcon icon="ant-design:close-outlined" width="20" height="20" />
        </template>
      </a-button>

      <!-- 始终占位，禁用时隐藏点击但不卸 DOM，避免切到首/末张时按钮显隐跳动 -->
      <a-button
        class="viewer-nav viewer-prev"
        shape="circle"
        type="text"
        title="上一张"
        :disabled="!canPrev"
        :class="{ 'is-disabled': !canPrev }"
        @click.stop="prev"
      >
        <template #icon>
          <CcIconifyIcon icon="ant-design:left-outlined" width="24" height="24" />
        </template>
      </a-button>

      <a-button
        class="viewer-nav viewer-next"
        shape="circle"
        type="text"
        title="下一张"
        :disabled="!canNext"
        :class="{ 'is-disabled': !canNext }"
        @click.stop="next"
      >
        <template #icon>
          <CcIconifyIcon icon="ant-design:right-outlined" width="24" height="24" />
        </template>
      </a-button>

      <div class="viewer-content" @click.stop>
        <MediaPreviewZoom
          v-if="previewZoomable"
          class="viewer-zoom-wrap"
          :active="true"
          :reset-key="current?.file.path"
          :toolbar-target="zoomToolbarRef"
        >
          <template v-if="current">
            <a-result v-if="loadFailed" status="error" title="无法加载该文件" :sub-title="current.file.name" class="viewer-result" />

            <CcImage
              v-else-if="current.file.kind === 'image'"
              class="viewer-media viewer-img"
              :src="imagePreviewSrc(current.file)"
              fit="contain"
              width="100%"
              max-height="100%"
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
            <a-result
              v-else-if="videoPlaybackError"
              status="error"
              :title="videoPlaybackError"
              :sub-title="current.file.name"
              class="viewer-result"
            />
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

      <div v-if="infoTitle || infoMeta" class="viewer-info" @click.stop>
        <span v-if="infoTitle" class="info-name">{{ infoTitle }}</span>
        <span v-if="infoMeta" class="info-meta">{{ infoMeta }}</span>
      </div>
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
}
.viewer-top-toolbar {
  position: absolute;
  top: 12px;
  left: 50%;
  z-index: 2;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;

  :deep(> *) {
    pointer-events: auto;
  }
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
    &:hover {
      color: var(--color-error);
      background: var(--color-fill);
    }
  }
}
.viewer-close {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 2;
  width: 40px;
  height: 40px;
  background: var(--color-overlay-hover);
  color: var(--color-text-secondary);
  &:hover {
    background: var(--color-fill);
    color: var(--color-text-light-solid);
  }
}
.viewer-nav {
  position: absolute;
  top: 50%;
  /* 不用 transform 垂直居中：antd 按下态也会改 transform，叠加后点击会跳 */
  margin-top: -24px;
  z-index: 2;
  width: 48px;
  height: 48px;
  background: var(--color-overlay-hover);
  color: var(--color-text-secondary);
  &:hover:not(:disabled) {
    background: var(--color-fill);
    color: var(--color-text-light-solid);
  }
  &.is-disabled,
  &:disabled {
    opacity: 0;
    pointer-events: none;
  }
}
.viewer-prev {
  left: 16px;
}
.viewer-next {
  right: 16px;
}
.viewer-zoom-wrap {
  width: 100%;
  height: 100%;
}
.viewer-content {
  width: 90vw;
  max-width: 90vw;
  height: 85vh;
  max-height: 85vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.viewer-info {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 2;
  padding: 12px 20px;
  background: linear-gradient(transparent, var(--color-bg-mask-strong));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.info-name {
  color: var(--color-text);
  font-size: 13px;
  font-weight: 500;
  max-width: 80vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.info-meta {
  color: var(--color-text-tertiary);
  font-size: 12px;
}
.viewer-media {
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 4px;
}
.viewer-img {
  display: flex;
  align-items: center;
  justify-content: center;

  &.base-image,
  :deep(.base-image) {
    max-width: 90vw;
    max-height: 85vh;
  }

  :deep(.ant-image-img) {
    max-width: 90vw;
    max-height: 85vh;
    object-fit: contain;
  }
}
.viewer-result {
  padding: 24px 0;
  :deep(.ant-result-subtitle) {
    word-break: break-all;
    max-width: 60vw;
  }
}
.live-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
.video-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
</style>
