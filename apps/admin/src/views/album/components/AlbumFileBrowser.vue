<!--
  相册文件资源模式主区（虚拟滚动 + 意图勾选）
  职责：当前目录文件夹+媒体宫格；可视区切片；空闲双击进目录/预览；
  意图内勾选仅当前层同级文件夹/文件（可多选）；执行时文件夹再展开媒体；禁止意图内进目录
  适用：album/index.vue「文件」模式
-->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useElementSize, useScroll } from "@vueuse/core";
import AlbumFolderGlyph from "./AlbumFolderGlyph.vue";
import AlbumThumbCard from "./AlbumThumbCard.vue";
import { ALBUM_LAYOUT, computeAlbumGridLayout } from "../albumLayout";
import type { AlbumFileFolder } from "../albumFileBrowser";
import {
  albumFileCellHeight,
  buildAlbumFileGridItems,
  buildAlbumFileLayout,
  FILE_ITEM_NAME_GAP,
  FILE_ITEM_NAME_H,
  sliceVisibleFilePlacements,
  type AlbumFilePlacement
} from "../albumFileLayout";
import type { MediaFile } from "../types";

defineOptions({ name: "AlbumFileBrowser" });

const props = withDefaults(
  defineProps<{
    folders: AlbumFileFolder[];
    files: MediaFile[];
    /** 意图勾选态 */
    selectMode?: boolean;
    isSelected: (path: string) => boolean;
    /** 文件夹是否全选（含子孙）；仅未选/全选 */
    isFolderSelected: (relPath: string) => boolean;
    marqueeStyle?: Record<string, string> | null;
    marqueeActive?: boolean;
  }>(),
  {
    selectMode: false,
    marqueeStyle: null,
    marqueeActive: false
  }
);

const emit = defineEmits<{
  enterFolder: [relPath: string];
  open: [file: MediaFile];
  delete: [file: MediaFile];
  reveal: [file: MediaFile];
  toggleFile: [file: MediaFile];
  toggleFolder: [relPath: string];
  /** 全量格子坐标（供父页框选） */
  "update:placements": [placements: AlbumFilePlacement[]];
  pointerDown: [event: PointerEvent, host: { scrollEl: HTMLElement; canvasEl: HTMLElement }];
  dragStart: [event: DragEvent];
}>();

const { gridGap: GAP, gridPadding: PAD, bufferRows: BUFFER_ROWS } = ALBUM_LAYOUT;

const scrollEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLElement | null>(null);
const { width: containerWidth, height: viewportHeight } = useElementSize(scrollEl);
const { y: scrollTop } = useScroll(scrollEl, { throttle: 60 });

const isEmpty = computed(() => props.folders.length === 0 && props.files.length === 0);

const gridItems = computed(() => buildAlbumFileGridItems(props.folders, props.files));

const gridAvailWidth = computed(() => Math.max(0, containerWidth.value - PAD * 2));
const gridLayout = computed(() => computeAlbumGridLayout(gridAvailWidth.value));
const cellWidth = computed(() => gridLayout.value.thumbSize);
const cellHeight = computed(() => albumFileCellHeight(cellWidth.value));
const cols = computed(() => gridLayout.value.cols);

const fullLayout = computed(() =>
  buildAlbumFileLayout(gridItems.value, cols.value, cellWidth.value, cellHeight.value, GAP, GAP)
);

watch(
  () => fullLayout.value.placements,
  placements => emit("update:placements", placements),
  { immediate: true }
);

const bufferPx = computed(() => Math.max(120, BUFFER_ROWS * (cellHeight.value + GAP)));

const visiblePlacements = computed(() =>
  sliceVisibleFilePlacements(fullLayout.value.placements, scrollTop.value, viewportHeight.value, bufferPx.value)
);

const visibleCoverUrls = computed(() => {
  const map = new Map<string, string>();
  for (const p of visiblePlacements.value) {
    if (p.item.kind !== "folder") continue;
    const path = p.item.folder.cover?.thumbPath?.trim();
    if (path) map.set(p.item.folder.relPath, convertFileSrc(path));
  }
  return map;
});

/** 换目录 / 列表变化：滚回顶 */
watch(gridItems, async () => {
  await nextTick();
  const el = scrollEl.value;
  if (!el) return;
  el.scrollTop = 0;
  scrollTop.value = 0;
});

function onFolderClick(folder: AlbumFileFolder) {
  if (!props.selectMode) return;
  emit("toggleFolder", folder.relPath);
}

function onFolderActivate(folder: AlbumFileFolder) {
  // 意图内禁止进目录（3A）
  if (props.selectMode) return;
  emit("enterFolder", folder.relPath);
}

function onFileClick(file: MediaFile) {
  if (!props.selectMode) return;
  emit("toggleFile", file);
}

function onFileActivate(file: MediaFile) {
  if (props.selectMode) return;
  emit("open", file);
}

function onBrowserPointerDown(event: PointerEvent) {
  const scroll = scrollEl.value;
  const canvas = canvasEl.value;
  if (!scroll || !canvas || !props.selectMode) return;
  emit("pointerDown", event, { scrollEl: scroll, canvasEl: canvas });
}

function placementStyle(p: AlbumFilePlacement): Record<string, string> {
  return {
    left: `${p.left}px`,
    top: `${p.top}px`,
    width: `${p.width}px`,
    height: `${p.height}px`
  };
}

function thumbHostStyle(cellW: number): Record<string, string> {
  return {
    position: "relative",
    left: "auto",
    top: "auto",
    width: `${cellW}px`,
    height: `${cellW}px`,
    flexShrink: "0"
  };
}

function folderGlyphClass(folder: AlbumFileFolder): Record<string, boolean> {
  if (!props.selectMode) return {};
  return { "is-selected": props.isFolderSelected(folder.relPath) };
}
</script>

<template>
  <div
    ref="scrollEl"
    class="file-browser"
    :class="{ 'is-marquee': marqueeActive }"
    @pointerdown="onBrowserPointerDown"
    @dragstart="emit('dragStart', $event)"
  >
    <a-empty v-if="isEmpty" description="此文件夹为空" class="state-empty-inline" />
    <div
      v-else
      ref="canvasEl"
      class="file-canvas"
      :style="{
        height: `${fullLayout.totalHeight}px`,
        '--file-thumb': `${cellWidth}px`,
        '--file-name-gap': `${FILE_ITEM_NAME_GAP}px`,
        '--file-name-h': `${FILE_ITEM_NAME_H}px`
      }"
    >
      <template v-for="p in visiblePlacements" :key="p.item.key">
        <button
          v-if="p.item.kind === 'folder'"
          type="button"
          class="folder-tile"
          :title="p.item.folder.name"
          :style="placementStyle(p)"
          @click="onFolderClick(p.item.folder)"
          @dblclick="onFolderActivate(p.item.folder)"
          @keydown.enter.prevent="onFolderActivate(p.item.folder)"
        >
          <span class="folder-glyph-host" :class="folderGlyphClass(p.item.folder)">
            <AlbumFolderGlyph :cover-src="visibleCoverUrls.get(p.item.folder.relPath)" />
          </span>
          <span class="item-name">{{ p.item.folder.name }}</span>
        </button>

        <div
          v-else
          class="file-tile"
          :title="p.item.file.name"
          :style="placementStyle(p)"
          @click="onFileClick(p.item.file)"
          @dblclick="onFileActivate(p.item.file)"
        >
          <!-- selected 只驱动压暗+主色环；单击勾选由外层处理，避免与 Card 内 toggle 双触发 -->
          <AlbumThumbCard
            :file="p.item.file"
            :selected="selectMode && isSelected(p.item.file.path)"
            :style="thumbHostStyle(cellWidth)"
            @delete="emit('delete', $event)"
            @reveal="emit('reveal', $event)"
          />
          <span class="item-name" :title="p.item.file.name">{{ p.item.file.name }}</span>
        </div>
      </template>
      <div v-if="marqueeStyle" class="file-marquee" :style="marqueeStyle" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.file-browser {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
  user-select: none;

  &.is-marquee {
    cursor: crosshair;
  }
}

.state-empty-inline {
  padding: 48px 0;
}

.file-canvas {
  position: relative;
  width: 100%;
}

.folder-tile,
.file-tile {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0;
  padding: 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  user-select: none;
}

/*
 * 与媒体缩略图同为 thumb×thumb 方格，文件名行才能横齐。
 * 黄夹本身偏扁，居中放入方格，选中环贴方格边（对齐 ThumbCard）。
 */
.folder-glyph-host {
  position: relative;
  box-sizing: border-box;
  width: var(--file-thumb);
  height: var(--file-thumb);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  overflow: hidden;

  :deep(.folder-glyph) {
    width: 100%;
    /* 铬层 285:223，宽度撑满后高度自然低于方格 */
    max-height: 100%;
  }

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

.item-name {
  width: 100%;
  max-width: var(--file-thumb);
  margin-top: var(--file-name-gap);
  height: var(--file-name-h);
  padding: 0 2px;
  font-size: 12px;
  line-height: var(--file-name-h);
  text-align: center;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-marquee {
  position: absolute;
  z-index: 4;
  box-sizing: border-box;
  border: 1px solid var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 18%, transparent);
  pointer-events: none;
}
</style>
