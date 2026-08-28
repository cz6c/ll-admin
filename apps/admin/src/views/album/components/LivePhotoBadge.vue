<!--
  Live Photos 角标（Apple 同心圆图标 + LIVE）
  职责：相册宫格、全屏查看器统一实况标识
  适用：AlbumThumbCard 缩略图角标、LivePhotoPlayer 预览角标
  @note 内容不做 v-if 裁剪，避免 mode/label 条件误判导致只剩空底块
-->
<script setup lang="ts">
withDefaults(
  defineProps<{
    /** sm=宫格缩略图；md=全屏查看器 */
    size?: "sm" | "md";
  }>(),
  { size: "sm" }
);

defineOptions({ name: "LivePhotoBadge", inheritAttrs: false });
</script>

<template>
  <span class="live-photo-badge" :class="`is-${size}`" title="Live Photos" v-bind="$attrs">
    <svg class="live-photo-badge-icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="#fff" stroke-width="1.35" />
      <circle cx="8" cy="8" r="3.75" fill="none" stroke="#fff" stroke-width="1.15" opacity="0.88" />
      <circle cx="8" cy="8" r="1.35" fill="#fff" />
    </svg>
    <span class="live-photo-badge-text">LIVE</span>
  </span>
</template>

<style scoped lang="scss">
.live-photo-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.68);
  color: #fff;
  line-height: 1;
  pointer-events: none;
  user-select: none;
  white-space: nowrap;
  box-sizing: border-box;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.28);
  -webkit-font-smoothing: antialiased;

  .live-photo-badge-icon {
    flex-shrink: 0;
    display: block;
  }

  &.is-sm {
    gap: 2px;
    padding: 2px 4px;
    font-size: 10px;

    .live-photo-badge-icon {
      width: 16px;
      height: 16px;
    }

    .live-photo-badge-text {
      font-size: 10px;
    }
  }

  &.is-md {
    gap: 4px;
    padding: 4px 6px;
    font-size: 11px;

    .live-photo-badge-icon {
      width: 18px;
      height: 18px;
    }

    .live-photo-badge-text {
      font-size: 12px;
    }
  }
}
</style>
