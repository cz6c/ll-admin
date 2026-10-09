<!--
  相册文件资源模式主区
  职责：当前目录下列出子文件夹与媒体；单击选中文件夹、双击进入；媒体预览/右键（无批量勾选）
  适用：album/index.vue「文件」模式；文件夹字形见 AlbumFolderGlyph
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import AlbumFolderGlyph from "./AlbumFolderGlyph.vue";
import AlbumThumbCard from "./AlbumThumbCard.vue";
import { ALBUM_LAYOUT } from "../albumLayout";
import type { AlbumFileFolder } from "../albumFileBrowser";
import type { MediaFile } from "../types";

defineOptions({ name: "AlbumFileBrowser" });

const props = defineProps<{
  folders: AlbumFileFolder[];
  files: MediaFile[];
}>();

const emit = defineEmits<{
  enterFolder: [relPath: string];
  open: [file: MediaFile];
  delete: [file: MediaFile];
  reveal: [file: MediaFile];
}>();

const thumbSize = ALBUM_LAYOUT.targetThumb;

/** Finder 式单击选中（仅视觉，不参与意图勾选） */
const selectedFolderRel = ref<string | null>(null);

watch(
  () => props.folders,
  () => {
    selectedFolderRel.value = null;
  }
);

const isEmpty = computed(() => props.folders.length === 0 && props.files.length === 0);

/** relPath → 封面 convertFileSrc URL */
const folderCoverUrls = computed(() => {
  const map = new Map<string, string>();
  for (const folder of props.folders) {
    const path = folder.cover?.thumbPath?.trim();
    if (path) map.set(folder.relPath, convertFileSrc(path));
  }
  return map;
});

function onSelected(path: string) {
  selectedFolderRel.value = path;
}

function onFolderActivate(folder: AlbumFileFolder) {
  emit("enterFolder", folder.relPath);
}

function thumbHostStyle(): Record<string, string> {
  return {
    position: "relative",
    left: "auto",
    top: "auto",
    width: `${thumbSize}px`,
    height: `${thumbSize}px`
  };
}
</script>

<template>
  <div class="file-browser">
    <a-empty v-if="isEmpty" description="此文件夹为空" class="state-empty-inline" />
    <div v-else class="file-grid" :style="{ '--file-thumb': `${thumbSize}px` }">
      <button
        v-for="folder in folders"
        :key="`dir-${folder.relPath}`"
        type="button"
        class="folder-tile"
        :class="{ 'is-selected': selectedFolderRel === folder.relPath }"
        :title="folder.name"
        @click="onSelected(folder.relPath)"
        @dblclick="onFolderActivate(folder)"
        @keydown.enter.prevent="onFolderActivate(folder)"
      >
        <span class="folder-icon-wrap">
          <AlbumFolderGlyph :cover-src="folderCoverUrls.get(folder.relPath)" />
        </span>
        <span class="item-name">{{ folder.name }}</span>
      </button>

      <div
        v-for="file in files"
        :key="file.path"
        class="file-tile"
        :class="{ 'is-selected': selectedFolderRel === file.path }"
        :title="file.name"
        @click="onSelected(file.path)"
        @dblclick="emit('open', file)"
      >
        <AlbumThumbCard :file="file" :style="thumbHostStyle()" @delete="emit('delete', $event)" @reveal="emit('reveal', $event)" />
        <span class="item-name" :title="file.name">{{ file.name }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.file-browser {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 12px 16px;
}

.state-empty-inline {
  padding: 48px 0;
}

.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--file-thumb), 1fr));
  gap: 20px 12px;
  align-content: start;
}

.folder-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 12px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 4px;
  color: inherit;
  cursor: pointer;

  /* 参考图：白细框包住图标+文案 */
  &.is-selected {
    border-color: #fff;
    background: #505050;
  }
}

.folder-icon-wrap {
  width: 100%;
  flex-shrink: 0;
}

.file-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 4px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 4px;
  color: inherit;
  cursor: pointer;

  /* 参考图：白细框包住图标+文案 */
  &.is-selected {
    border-color: #fff;
    background: #505050;
  }
}

.item-name {
  width: 100%;
  max-width: var(--file-thumb);
  padding: 0 2px;
  font-size: 12px;
  line-height: 16px;
  text-align: center;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
