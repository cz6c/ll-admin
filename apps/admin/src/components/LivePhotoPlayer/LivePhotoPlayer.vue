<!--
  Live Photo 播放器（本地文件）
  职责：全尺寸静态帧预览 + 按住/悬停播放配对 MOV
  适用：相册 MediaViewer、iCloud 同步落盘后的实况文件
  @note 不用 LivePhotosKit：本地 HEIC 需解码 JPEG；LPK 初始化易偏位，且播放低分辨率 MOV 会糊
-->
<script setup lang="ts">
import { convertFileSrc } from "@tauri-apps/api/core";

const props = defineProps<{
  /** 静态帧 JPG/HEIC 绝对路径 */
  photoPath: string;
  /** 配对 MOV 绝对路径 */
  videoPath: string;
  /** HEIC/HEIF 全尺寸解码 JPEG 缓存路径 */
  photoPreviewPath?: string;
}>();

defineOptions({ name: "LivePhotoPlayer" });

const videoRef = ref<HTMLVideoElement | null>(null);
const playing = ref(false);

/** HEIC/HEIF 在 WebView 中无法作为 img src 直接渲染 */
function isHeifPath(path: string): boolean {
  return /\.(heic|heif)$/i.test(path);
}

/** 实况静态帧 URL：HEIC 走全尺寸 JPEG 缓存，其余走原文件 */
const photoSrc = computed(() => {
  if (isHeifPath(props.photoPath)) {
    if (!props.photoPreviewPath) {
      return "";
    }
    return convertFileSrc(props.photoPreviewPath);
  }
  return convertFileSrc(props.photoPath);
});

const videoSrc = computed(() => convertFileSrc(props.videoPath));

/** 开始播放 MOV（悬停/按下） */
async function startPlay() {
  const video = videoRef.value;
  if (!video || playing.value) return;
  playing.value = true;
  try {
    video.currentTime = 0;
    await video.play();
  } catch {
    playing.value = false;
  }
}

/** 停止播放并回到静态帧 */
function stopPlay() {
  const video = videoRef.value;
  if (!video) return;
  playing.value = false;
  video.pause();
  video.currentTime = 0;
}

watch(
  () => [props.photoPath, props.videoPath, props.photoPreviewPath] as const,
  () => {
    stopPlay();
  }
);

onBeforeUnmount(() => {
  stopPlay();
});
</script>

<template>
  <div
    class="live-photo-player"
    @pointerenter="startPlay"
    @pointerleave="stopPlay"
    @pointerdown="startPlay"
    @pointerup="stopPlay"
    @pointercancel="stopPlay"
  >
    <div class="live-photo-frame">
      <img :src="photoSrc" class="live-photo-still" :class="{ 'is-hidden': playing }" alt="" />
      <video
        ref="videoRef"
        :src="videoSrc"
        class="live-photo-motion"
        :class="{ 'is-visible': playing }"
        muted
        playsinline
        preload="metadata"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.live-photo-player {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  cursor: pointer;
  touch-action: manipulation;
}

/* 以静态帧尺寸为框，视频叠在同区域，避免 LPK 绝对定位偏左 */
.live-photo-frame {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 90vw;
  max-height: 85vh;
}

.live-photo-still,
.live-photo-motion {
  display: block;
  max-width: 90vw;
  max-height: 85vh;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 4px;
}

.live-photo-motion {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease-out;

  &.is-visible {
    opacity: 1;
  }
}

.live-photo-still.is-hidden {
  visibility: hidden;
}
</style>
