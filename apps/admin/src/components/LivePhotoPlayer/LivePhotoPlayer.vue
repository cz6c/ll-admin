<!--
  Live Photo 播放器（Apple LivePhotosKit JS）
  职责：本地 JPG+MOV 配对实况预览；长按/点击触发播放
  适用：相册 MediaViewer、iCloud 同步落盘后的实况文件
  @see https://juejin.cn/post/7433997058976366618
-->
<script setup lang="ts">
import { convertFileSrc } from "@tauri-apps/api/core";
import { PlaybackStyle, Player, type Player as LivePhotoPlayerInstance } from "livephotoskit";

const props = defineProps<{
  /** 静态帧 JPG/HEIC 绝对路径 */
  photoPath: string;
  /** 配对 MOV 绝对路径 */
  videoPath: string;
}>();

defineOptions({ name: "LivePhotoPlayer" });

const containerRef = ref<HTMLElement | null>(null);
let player: LivePhotoPlayerInstance | null = null;

/** 销毁旧 player，避免切换文件时残留事件与 DOM */
function destroyPlayer() {
  if (!player) return;
  try {
    player.stop();
  } catch {
    /* 部分 WebView 卸载时 stop 可能抛错，忽略 */
  }
  player = null;
}

/** 挂载 LivePhotosKit Player 并绑定 asset 协议 URL */
async function initPlayer() {
  await nextTick();
  if (!containerRef.value || !props.photoPath || !props.videoPath) return;

  destroyPlayer();
  containerRef.value.replaceChildren();

  player = Player(containerRef.value);
  player.photoSrc = convertFileSrc(props.photoPath);
  player.videoSrc = convertFileSrc(props.videoPath);
  player.playbackStyle = PlaybackStyle.HINT;
}

watch(
  () => [props.photoPath, props.videoPath] as const,
  () => {
    initPlayer();
  },
  { flush: "post" }
);

onMounted(() => {
  initPlayer();
});

onBeforeUnmount(() => {
  destroyPlayer();
});
</script>

<template>
  <div ref="containerRef" class="live-photo-player" />
</template>

<style scoped lang="scss">
.live-photo-player {
  width: 100%;
  height: 100%;
  min-width: 200px;
  min-height: 200px;
  max-width: 90vw;
  max-height: 85vh;

  :deep(live-photo),
  :deep(div) {
    width: 100% !important;
    height: 100% !important;
  }

  :deep(img),
  :deep(video) {
    max-width: 90vw;
    max-height: 85vh;
    object-fit: contain;
  }
}
</style>
