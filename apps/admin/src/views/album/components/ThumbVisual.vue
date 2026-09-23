<!--
  缩略图纯视觉层：占位 / 视频遮罩 / 实况角标
  职责：接收 src + kind + ext，渲染统一的缩略图视觉；不含 IO 门控与交互
  适用：AlbumThumbMedia / ProtocolLazyThumb / DuplicateLazyThumb 内部复用
-->
<script setup lang="ts">
import LivePhotoBadge from "./LivePhotoBadge.vue";

const props = withDefaults(
  defineProps<{
    /** 已解析的缩略图 URL；空值显示占位 */
    src?: string;
    /** 媒体类型；决定占位图标与视频遮罩 */
    kind?: "image" | "video" | "livephoto";
    /** 扩展名（不含 .）；占位时显示 */
    ext?: string;
    /** 仅已配对 MOV 的实况展示角标 */
    showLiveBadge?: boolean;
    /** sm：列表小格；md：宫格默认 */
    size?: "sm" | "md";
    /** BaseImage 懒加载；IO 已门控时传 false 避免双重延迟 */
    lazy?: boolean;
  }>(),
  {
    src: undefined,
    kind: "image",
    ext: "",
    showLiveBadge: false,
    size: "md",
    lazy: true
  }
);

defineOptions({ name: "ThumbVisual" });

const placeholderIconSize = computed(() => (props.size === "sm" ? 18 : 32));
const playIconSize = computed(() => (props.size === "sm" ? 12 : 18));
const upperExt = computed(() => props.ext?.toUpperCase() ?? "");
</script>

<template>
  <div class="thumb-visual" :class="`is-${size}`">
    <LivePhotoBadge v-if="showLiveBadge" class="thumb-badge" size="sm" />
    <BaseImage v-if="src" class="thumb-img" :src="src" fit="cover" width="100%" height="100%" :lazy="lazy" />
    <div v-else-if="kind === 'image' || kind === 'livephoto'" class="thumb-placeholder">
      <IconifyIcon icon="ant-design:file-image-outlined" :width="placeholderIconSize" :height="placeholderIconSize" class="thumb-placeholder-icon" />
      <span v-if="size === 'md'" class="thumb-ext">{{ upperExt }}</span>
    </div>
    <div v-else class="thumb-placeholder">
      <IconifyIcon icon="ant-design:play-circle-filled" :width="placeholderIconSize" :height="placeholderIconSize" class="thumb-placeholder-icon" />
      <span v-if="size === 'md'" class="thumb-ext">{{ upperExt }}</span>
    </div>
    <div v-if="kind === 'video' && src" class="video-play-overlay">
      <span class="video-play-btn">
        <IconifyIcon icon="ant-design:caret-right-filled" :width="playIconSize" :height="playIconSize" class="video-play-icon" />
      </span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.thumb-visual {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--fill-color);
  /* 避免父级 font-size:0 导致角标文字不可见 */
  font-size: 12px;
}

.thumb-img {
  width: 100%;
  height: 100%;
  display: block;

  :deep(.base-image) {
    width: 100%;
    height: 100%;
    display: block;
  }
}

.thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: var(--fill-color);
}

.thumb-ext {
  font-size: 10px;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
}

.thumb-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 3;
}

.thumb-visual.is-sm .thumb-badge {
  top: 2px;
  left: 2px;
  transform: scale(0.85);
  transform-origin: top left;
}

.thumb-placeholder-icon {
  color: var(--color-text-quaternary, rgba(0, 0, 0, 0.25));
}

.video-play-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.video-play-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28);
}

.thumb-visual.is-sm .video-play-btn {
  width: 22px;
  height: 22px;
}

.video-play-icon {
  margin-left: 2px;
  color: rgba(0, 0, 0, 0.72);
}
</style>
