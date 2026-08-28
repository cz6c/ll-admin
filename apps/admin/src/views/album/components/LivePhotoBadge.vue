<!--
  Live Photos 角标（Apple 同心圆图标 + LIVE）
  职责：相册宫格、全屏查看器统一实况标识
  适用：AlbumThumbCard 缩略图角标、LivePhotoPlayer 预览角标
-->
<script setup lang="ts">
withDefaults(
  defineProps<{
    /** sm=宫格缩略图；md=全屏查看器 */
    size?: "sm" | "md";
  }>(),
  { size: "md" }
);

defineOptions({ name: "LivePhotoBadge" });
</script>

<template>
  <span class="live-photo-badge" :class="`is-${size}`" title="Live Photos">
    <svg class="live-photo-badge-icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.25" opacity="0.85" />
      <circle cx="8" cy="8" r="3.75" fill="none" stroke="currentColor" stroke-width="1.1" opacity="0.65" />
      <circle cx="8" cy="8" r="1.35" fill="currentColor" />
    </svg>
    <span class="live-photo-badge-text">LIVE</span>
  </span>
</template>

<style scoped lang="scss">
.live-photo-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.62);
  color: #fff;
  letter-spacing: 0.04em;
  line-height: 1;
  pointer-events: none;
  user-select: none;
  white-space: nowrap;

  &.is-sm {
    gap: 3px;
    padding: 2px 6px 2px 5px;
    border-radius: 3px;
    font-size: 9px;

    .live-photo-badge-icon {
      width: 18px;
      height: 18px;
    }
  }

  &.is-md {
    padding: 4px 9px 4px 7px;
    font-size: 11px;

    .live-photo-badge-icon {
      width: 18px;
      height: 18px;
    }
  }
}

.live-photo-badge-icon {
  flex-shrink: 0;
  display: block;
}

.live-photo-badge-text {
  font-size: inherit;
}
</style>
