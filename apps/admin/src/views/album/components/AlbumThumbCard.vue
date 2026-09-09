<!--
  相册宫格缩略图卡片
  职责：单格缩略图壳（画面复用 AlbumThumbMedia）、右键菜单
  适用：album/index.vue 虚拟滚动宫格
-->
<script setup lang="ts">
import AlbumThumbMedia from "./AlbumThumbMedia.vue";
import type { MediaFile } from "../types";

const props = defineProps<{
  file: MediaFile;
}>();

const emit = defineEmits<{
  open: [file: MediaFile];
  delete: [file: MediaFile];
}>();

defineOptions({ name: "AlbumThumbCard", inheritAttrs: false });

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
        <AlbumThumbMedia :file="file" />
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

  &:hover :deep(.thumb-img) {
    opacity: 0.85;
  }
}
</style>
