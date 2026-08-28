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
      <div class="thumb-card" @click="onOpen">
      <img v-if="thumbUrl" :src="thumbUrl" class="thumb-img" loading="lazy" decoding="async" alt="" />
      <div v-else-if="file.kind === 'image' || file.kind === 'livephoto'" class="thumb-placeholder">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.3)" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
        <span class="thumb-ext">{{ file.ext.toUpperCase() }}</span>
      </div>
      <div v-else class="thumb-placeholder">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(0,0,0,0.5)">
          <path d="M8 5v14l11-7z" />
        </svg>
        <span class="thumb-ext">{{ file.ext.toUpperCase() }}</span>
      </div>
      <LivePhotoBadge v-if="file.kind === 'livephoto'" class="thumb-live-badge" size="sm" />
      <span v-if="file.kind === 'video'" class="badge-video">{{ file.ext.toUpperCase() }}</span>
      <div v-if="file.kind === 'video' && thumbUrl" class="video-play-overlay">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="rgba(255,255,255,0.92)">
          <path d="M8 5v14l11-7z" />
        </svg>
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

.thumb-live-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  z-index: 1;
}

.badge-video {
  position: absolute;
  top: 4px;
  left: 4px;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.65);
  color: rgba(255, 255, 255, 0.7);
  font-size: 10px;
  font-weight: 600;
}

.video-play-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.35));
}
</style>
