<!--
  全屏媒体查看器
  职责：全屏预览图片/视频/实况照片；键盘导航；上一张/下一张
-->
<script setup lang="ts">
import LivePhotoPlayer from "@/components/LivePhotoPlayer/LivePhotoPlayer.vue";
import { convertFileSrc } from "@tauri-apps/api/core";

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

interface FlatFile {
  file: MediaFile;
  groupName: string;
}

const props = defineProps<{
  groups: MediaGroup[];
  initialGroupIdx: number;
  initialFileIdx: number;
}>();

const emit = defineEmits<{ close: [] }>();

defineOptions({ name: "MediaViewer" });

const currentIndex = ref(0);

const flatFiles = computed<FlatFile[]>(() => {
  const result: FlatFile[] = [];
  for (const group of props.groups) {
    for (const file of group.files) {
      result.push({ file, groupName: group.dirName });
    }
  }
  return result;
});

const current = computed(() => flatFiles.value[currentIndex.value]);

function calcInitialIndex(): number {
  let idx = 0;
  for (let g = 0; g < props.initialGroupIdx && g < props.groups.length; g++) {
    idx += props.groups[g].files.length;
  }
  idx += props.initialFileIdx;
  return Math.min(Math.max(0, idx), flatFiles.value.length - 1);
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
      <!-- 普通图片 -->
      <img v-if="current.file.kind === 'image'" :src="imagePreviewSrc(current.file)" class="viewer-media viewer-img" alt="" />

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
      <video v-else :key="current.file.path" :src="getMediaSrc(current.file.path)" controls autoplay class="viewer-media viewer-video" />
    </div>

    <div class="viewer-info">
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
  background: rgba(0, 0, 0, 0.95);
}
.viewer-close {
  position: absolute;
  top: 12px;
  right: 16px;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  &:hover {
    background: rgba(255, 255, 255, 0.2);
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
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 32px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  &:hover {
    background: rgba(255, 255, 255, 0.18);
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
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.6));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.info-name {
  color: #fff;
  font-size: 13px;
  font-weight: 500;
}
.info-meta {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
}
</style>
