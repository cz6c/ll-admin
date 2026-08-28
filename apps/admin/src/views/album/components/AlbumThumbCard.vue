<!--
  相册宫格缩略图卡片
  职责：单格缩略图展示（图/视频/实况）、角标、右键菜单
  适用：album/index.vue 虚拟滚动宫格
-->
<script setup lang="ts">
import { convertFileSrc } from "@tauri-apps/api/core";
import LivePhotoBadge from "./LivePhotoBadge.vue";
import type { MediaFile } from "../types";

const props = defineProps<{
  file: MediaFile;
}>();

const emit = defineEmits<{
  open: [file: MediaFile];
  delete: [file: MediaFile];
}>();

defineOptions({ name: "AlbumThumbCard", inheritAttrs: false });

const thumbUrl = computed(() => {
  if (!props.file.thumbPath) return undefined;
  return convertFileSrc(props.file.thumbPath);
});

/** 仅已配对 MOV 的实况展示角标，避免 kind 误判时出现空角标块 */
const showLiveBadge = computed(
  () => props.file.kind === "livephoto" && !!props.file.videoPath?.trim()
);

function onOpen() {
  emit("open", props.file);
}

function onDelete() {
  emit("delete", props.file);
}
</script>

<template>
  <div class="thumb-card-host" v-bind="$attrs">
    <a-dropdown :trigger="['contextmenu']">
      <div class="thumb-card-shell">
        <LivePhotoBadge v-if="showLiveBadge" class="thumb-badge" size="sm" />
        <div class="thumb-card" @click="onOpen">
          <img v-if="thumbUrl" :src="thumbUrl" class="thumb-img" loading="lazy" decoding="async" alt="" />
          <div v-else-if="file.kind === 'image' || file.kind === 'livephoto'" class="thumb-placeholder">
            <IconifyIcon icon="ant-design:file-image-outlined" width="32" height="32" class="thumb-placeholder-icon" />
            <span class="thumb-ext">{{ file.ext.toUpperCase() }}</span>
          </div>
          <div v-else class="thumb-placeholder">
            <IconifyIcon icon="ant-design:play-circle-filled" width="32" height="32" class="thumb-placeholder-icon" />
            <span class="thumb-ext">{{ file.ext.toUpperCase() }}</span>
          </div>
          <div v-if="file.kind === 'video' && thumbUrl" class="video-play-overlay">
            <span class="video-play-btn">
              <IconifyIcon icon="ant-design:caret-right-filled" width="18" height="18" class="video-play-icon" />
            </span>
          </div>
        </div>
      </div>
    <template #overlay>
      <a-menu>
        <a-menu-item key="delete-local" danger @click="onDelete">删除本地</a-menu-item>
      </a-menu>
    </template>
    </a-dropdown>
  </div>
</template>

<style scoped lang="scss">
.thumb-card-host {
  position: absolute;
}

.thumb-card-shell {
  position: relative;
  width: 100%;
  height: 100%;
  /* 避免 a-dropdown trigger 继承 font-size:0 导致角标文字不可见 */
  font-size: 12px;
}

.thumb-card {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  background: var(--fill-color);

  &:hover .thumb-img {
    opacity: 0.85;
  }
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
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

.video-play-icon {
  margin-left: 2px;
  color: rgba(0, 0, 0, 0.72);
}
</style>
