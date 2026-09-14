<!--
  全屏媒体查看器
  职责：本地相册图片/视频/实况预览；键盘与导航由 MediaLightboxShell 承接
-->
<script setup lang="ts">
import LivePhotoPlayer from "./LivePhotoPlayer.vue";
import MediaLightboxShell from "./MediaLightboxShell.vue";
import { useAlbumPlaybackSrc } from "@/composables/useAlbumPlayback";
import { convertFileSrc } from "@tauri-apps/api/core";
import dayjs from "dayjs";
import type { FlatFile, MediaFile, MediaGroup } from "../types";

const props = defineProps<{
  groups: MediaGroup[];
  initialGroupIdx: number;
  initialFileIdx: number;
}>();

const emit = defineEmits<{ close: [] }>();

defineOptions({ name: "MediaViewer" });

const currentIndex = ref(0);
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
  if (currentIndex.value > 0) currentIndex.value--;
}

function next() {
  if (currentIndex.value < flatFiles.value.length - 1) currentIndex.value++;
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

onMounted(() => {
  currentIndex.value = calcInitialIndex();
});
</script>

<template>
  <MediaLightboxShell
    :open="true"
    :title="infoTitle"
    :meta="infoMeta"
    :can-prev="currentIndex > 0"
    :can-next="currentIndex < flatFiles.length - 1"
    @close="emit('close')"
    @prev="prev"
    @next="next"
  >
    <template v-if="current">
      <a-result v-if="loadFailed" status="error" title="无法加载该文件" :sub-title="current.file.name" class="viewer-result" />

      <BaseImage
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
  </MediaLightboxShell>
</template>

<style scoped lang="scss">
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
