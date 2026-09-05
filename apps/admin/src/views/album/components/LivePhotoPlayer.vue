<!--
  Live Photo 播放器（本地文件）
  职责：全尺寸静态帧预览 + 按住/悬停播放配对 MOV
  适用：MediaViewer、iCloud 同步落盘后的实况文件
  @note 不用 LivePhotosKit：本地 HEIC 需解码 JPEG；LPK 初始化易偏位，且播放低分辨率 MOV 会糊
-->
<script setup lang="ts">
import { convertFileSrc } from "@tauri-apps/api/core";
import { useAlbumPlaybackSrc } from "@/composables/useAlbumPlayback";
import LivePhotoBadge from "./LivePhotoBadge.vue";

const props = withDefaults(
  defineProps<{
    /** 静态帧 JPG/HEIC 绝对路径 */
    photoPath: string;
    /** 配对 MOV 绝对路径 */
    videoPath: string;
    /** HEIC/HEIF 全尺寸解码 JPEG 缓存路径 */
    photoPreviewPath?: string;
    /** 扫描预热的 H.264 代理；有则跳过打开时转码 */
    playbackPath?: string;
    /** 是否在静态帧左上角显示 Live 角标 */
    showBadge?: boolean;
  }>(),
  { showBadge: true }
);

defineOptions({ name: "LivePhotoPlayer" });

const videoRef = ref<HTMLVideoElement | null>(null);
const playing = ref(false);

/** 已有代理则不再 invoke ensure（扫描期预热优先） */
const preferredPlaybackSrc = computed(() => {
  const p = props.playbackPath?.trim();
  return p ? convertFileSrc(p) : "";
});
const ensureSourcePath = computed(() => {
  if (preferredPlaybackSrc.value) return undefined;
  return props.videoPath?.trim() || undefined;
});
const { playbackSrc: ensuredSrc, loading: playbackLoading, error: playbackError } =
  useAlbumPlaybackSrc(ensureSourcePath);

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

/** 实况 MOV：优先扫描预热代理，否则懒转码 */
const videoSrc = computed(() => preferredPlaybackSrc.value || ensuredSrc.value);

/** 开始播放 MOV（悬停/按下）；转码未完成时不发起播放 */
async function startPlay() {
  const video = videoRef.value;
  if (!video || playing.value || playbackLoading.value || !videoSrc.value) return;
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
  () => [props.photoPath, props.videoPath, props.photoPreviewPath, props.playbackPath] as const,
  () => {
    stopPlay();
  }
);

onBeforeUnmount(() => {
  stopPlay();
});
</script>

<template>
  <div class="live-photo-player">
    <div
      class="live-photo-frame"
      @pointerenter="startPlay"
      @pointerleave="stopPlay"
      @pointerdown="startPlay"
      @pointerup="stopPlay"
      @pointercancel="stopPlay"
    >
      <img :src="photoSrc" class="live-photo-still" :class="{ 'is-hidden': playing }" alt="" />
      <div v-if="playbackLoading" class="live-photo-status">
        <a-spin tip="正在准备播放…" />
      </div>
      <a-alert v-else-if="playbackError" class="live-photo-status" type="error" :message="playbackError" banner />
      <video
        v-show="!playbackLoading && !playbackError"
        ref="videoRef"
        :src="videoSrc"
        class="live-photo-motion"
        :class="{ 'is-visible': playing }"
        muted
        playsinline
        preload="metadata"
      />
      <LivePhotoBadge v-if="props.showBadge" size="md" class="live-badge" />
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 外层仅居中，不撑满预览区；交互绑在 frame（随图片 intrinsic 尺寸） */
.live-photo-player {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  max-height: 100%;
}

.live-photo-frame {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 90vw;
  max-height: 85vh;
  cursor: pointer;
  touch-action: manipulation;
  line-height: 0;
}

.live-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 4;
}

.live-photo-still {
  display: block;
  max-width: 90vw;
  max-height: 85vh;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 4px;
}

.live-photo-motion {
  display: block;
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 4px;
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
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

.live-photo-status {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: rgba(255, 255, 255, 0.72);
  border-radius: 4px;

  :deep(.ant-alert) {
    width: 100%;
  }
}
</style>
