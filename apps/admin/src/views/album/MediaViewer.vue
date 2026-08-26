<!--
  全屏媒体查看器
  职责：全屏预览图片/视频/实况照片；键盘导航；上一张/下一张
-->
<script setup lang="ts">
import LivePhotoPlayer from "@/components/LivePhotoPlayer/LivePhotoPlayer.vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { FlatFile, MediaFile, MediaGroup } from "./types";

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

function onMediaError() {
  loadFailed.value = true;
}

// 切换媒体时重置失败态
watch(currentIndex, () => {
  loadFailed.value = false;
});

function onKeydown(e: KeyboardEvent) {
  switch (e.key) {
    case "Escape":
      emit("close");
      break;
    case "ArrowLeft":
      prev();
      break;
    case "ArrowRight":
      next();
      break;
  }
}

onMounted(() => {
  currentIndex.value = calcInitialIndex();
  window.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <div class="viewer-overlay" @click="emit('close')">
    <button class="viewer-close" title="关闭 (Esc)" @click.stop="emit('close')">
      <span>&times;</span>
    </button>

    <button v-if="currentIndex > 0" class="viewer-nav viewer-prev" title="上一张" @click.stop="prev">
      <span>&lsaquo;</span>
    </button>

    <button v-if="currentIndex < flatFiles.length - 1" class="viewer-nav viewer-next" title="下一张" @click.stop="next">
      <span>&rsaquo;</span>
    </button>

    <div class="viewer-content" @click.stop>
      <template v-if="current">
        <!-- 加载失败占位 -->
        <div v-if="loadFailed" class="viewer-failed">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" stroke-width="1.2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <p class="failed-text">无法加载该文件</p>
          <p class="failed-name">{{ current.file.name }}</p>
        </div>

        <!-- 普通图片 -->
        <img
          v-else-if="current.file.kind === 'image'"
          :src="imagePreviewSrc(current.file)"
          class="viewer-media viewer-img"
          alt=""
          @error="onMediaError"
        />

        <!-- 实况照片（LivePhotosKit：长按/点击播放 MOV） -->
        <div v-else-if="current.file.kind === 'livephoto'" class="live-container">
          <LivePhotoPlayer
            class="live-photo-player-host"
            :key="current.file.path"
            :photo-path="current.file.path"
            :video-path="current.file.videoPath || ''"
            :photo-preview-path="current.file.previewPath"
          />
          <span class="live-badge-viewer">Live</span>
        </div>

        <!-- 普通视频 -->
        <video
          v-else
          :key="current.file.path"
          :src="getMediaSrc(current.file.path)"
          controls
          autoplay
          class="viewer-media viewer-video"
          @error="onMediaError"
        />
      </template>
    </div>

    <div v-if="current" class="viewer-info">
      <span class="info-name">{{ current.file.name }}</span>
      <span class="info-meta"> {{ current.groupName }} · {{ formatSize(current.file.size) }} · {{ currentIndex + 1 }} / {{ flatFiles.length }} </span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.viewer-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.96);
}
.viewer-close {
  position: absolute;
  top: 12px;
  right: 16px;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.06);
  color: var(--color-text);
  font-size: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  &:hover {
    background: rgba(0, 0, 0, 0.12);
  }
}
.viewer-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.06);
  color: var(--color-text);
  font-size: 32px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  &:hover {
    background: rgba(0, 0, 0, 0.12);
  }
}
.viewer-prev {
  left: 16px;
}
.viewer-next {
  right: 16px;
}
.viewer-content {
  width: 90vw;
  max-width: 90vw;
  height: 85vh;
  max-height: 85vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.viewer-media {
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 4px;
}
.viewer-failed {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-text-secondary);
}
.failed-text {
  margin: 8px 0 0;
  font-size: 14px;
}
.failed-name {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-tertiary);
  word-break: break-all;
  text-align: center;
  max-width: 60vw;
}
.live-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
.live-photo-player-host {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
}
.live-badge-viewer {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: #4ade80;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
}
.viewer-info {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 20px;
  background: linear-gradient(transparent, rgba(255, 255, 255, 0.92));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.info-name {
  color: var(--color-text);
  font-size: 13px;
  font-weight: 500;
}
.info-meta {
  color: var(--color-text-secondary);
  font-size: 12px;
}
</style>
