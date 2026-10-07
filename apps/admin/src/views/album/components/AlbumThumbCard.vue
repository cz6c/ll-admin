<!--
  相册宫格缩略图卡片
  职责：单格缩略图壳、同步来源角标、右键菜单；勾选=压暗图+主色环（未选无态，不占 LIVE/同步角）
  适用：album/index.vue 虚拟滚动宫格
-->
<script setup lang="ts">
import { computed } from "vue";
import AlbumThumbMedia from "./AlbumThumbMedia.vue";
import { isSyncedLibrarySource, libraryLabel, normalizeLibraryKey } from "../albumLibrary";
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

/** 非本地图库：右上角云同步角标 */
const showSyncBadge = computed(() => isSyncedLibrarySource(props.file));

const syncBadgeTitle = computed(() => {
  if (!showSyncBadge.value) return "";
  return `同步 · ${libraryLabel(normalizeLibraryKey(props.file))}`;
});

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
      <div
        class="thumb-card"
        :class="{ 'is-selected': selected }"
        @click="onClick"
      >
        <AlbumThumbMedia :file="file" />
        <span v-if="showSyncBadge" class="cell-sync" :title="syncBadgeTitle" aria-label="同步入库">
          <CcIconifyIcon icon="ant-design:cloud-sync-outlined" width="12px" height="12px" />
        </span>
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

  /* Dropdown 触发器须撑满定位框，否则选中环落在塌缩高度上 */
  :deep(.ant-dropdown-trigger),
  > .thumb-card {
    display: block;
    width: 100%;
    height: 100%;
  }
}

.thumb-card {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  transition: opacity var(--dur-fade, 0.15s) var(--ease-out, ease);

  &:hover :deep(.thumb-img) {
    opacity: 0.85;
  }

  /*
   * 勾选态：压暗图片区；未选保持原样（比「未选压暗」更易辨认）。
   * 环用 ::after 叠在媒体上——outline 会被 overflow 裁，inset shadow 会被图盖住。
   */
  &.is-selected::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 3;
    border-radius: inherit;
    background: var(--color-bg-mask-strong);
    opacity: 0.45;
    pointer-events: none;
  }

  &.is-selected::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 4;
    box-sizing: border-box;
    border: 2px solid var(--color-primary);
    border-radius: inherit;
    pointer-events: none;
  }
}

.cell-sync {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: var(--color-bg-mask-strong);
  color: var(--color-text-light-solid);
  pointer-events: none;
}
</style>
