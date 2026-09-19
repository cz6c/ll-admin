<!--
  相册宫格缩略图卡片
  职责：单格缩略图壳（画面复用 AlbumThumbMedia）、右键菜单；勾选模式点格切换
  适用：album/index.vue 虚拟滚动宫格
-->
<script setup lang="ts">
import AlbumThumbMedia from "./AlbumThumbMedia.vue";
import type { MediaFile } from "../types";

const props = withDefaults(
  defineProps<{
    file: MediaFile;
    /** 勾选模式：点击切换选中，不开预览（对齐云同步宫格） */
    selectMode?: boolean;
    /** 当前格已选 */
    selected?: boolean;
  }>(),
  {
    selectMode: false,
    selected: false
  }
);

const emit = defineEmits<{
  open: [file: MediaFile];
  toggle: [file: MediaFile];
  delete: [file: MediaFile];
}>();

defineOptions({ name: "AlbumThumbCard", inheritAttrs: false });

function onClick() {
  if (props.selectMode) {
    emit("toggle", props.file);
    return;
  }
  emit("open", props.file);
}

function onDelete() {
  emit("delete", props.file);
}
</script>

<template>
  <div class="thumb-card-host" v-bind="$attrs">
    <a-dropdown :trigger="['contextmenu']">
      <div class="thumb-card" :class="{ 'is-selected': selected }" @click="onClick">
        <AlbumThumbMedia :file="file" />
        <span v-if="selected" class="cell-check" aria-hidden="true">✓</span>
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

  &.is-selected {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }
}

.cell-check {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: var(--color-primary);
  color: #fff;
  font-size: 12px;
  line-height: 20px;
  text-align: center;
  pointer-events: none;
}
</style>
