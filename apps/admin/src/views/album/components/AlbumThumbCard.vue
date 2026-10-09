<!--
  相册宫格缩略图卡片
  职责：单格缩略图壳、同步来源角标、视频时长角标、右键菜单；勾选=压暗图+主色环（未选无态，不占 LIVE/同步角）
  适用：album/index.vue 虚拟滚动宫格
-->
<script setup lang="ts">
import { computed } from "vue";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import AlbumThumbMedia from "./AlbumThumbMedia.vue";
import { isSyncedLibrarySource, libraryLabel, normalizeLibraryKey } from "../albumLibrary";
import type { MediaFile } from "../types";

const props = withDefaults(
  defineProps<{
    file: MediaFile;
    /** 意图勾选态：点击切换选中，不开预览（对齐云同步意图先行） */
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
  reveal: [file: MediaFile];
}>();

defineOptions({ name: "AlbumThumbCard", inheritAttrs: false });

dayjs.extend(duration);

/**
 * 右下角时长：仅普通视频（实况按产品约定不显示）；0 / 未探测不渲染
 * 不足 1 小时 `m:ss`，否则 `h:mm:ss`；不足 1 秒按 0:01 显示，避免出现 0:00
 */
const durationText = computed(() => {
  const ms = props.file.durationMs;
  if (props.file.kind !== "video" || !ms || ms <= 0) return "";
  const totalSec = Math.max(1, Math.round(ms / 1000));
  const d = dayjs.duration(totalSec, "seconds");
  if (totalSec < 3600) return d.format("m:ss");
  return `${Math.floor(totalSec / 3600)}:${d.format("mm:ss")}`;
});

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

function onReveal() {
  emit("reveal", props.file);
}
</script>

<template>
  <div class="thumb-card-host" v-bind="$attrs">
    <a-dropdown :trigger="['contextmenu']">
      <div class="thumb-card" :class="{ 'is-selected': selected }" @click="onClick">
        <AlbumThumbMedia :file="file" />
        <span v-if="showSyncBadge" class="cell-sync" :title="syncBadgeTitle" aria-label="同步入库">
          <CcIconifyIcon icon="ant-design:cloud-sync-outlined" width="12px" height="12px" />
        </span>
        <span v-if="durationText" class="cell-duration">{{ durationText }}</span>
      </div>
      <template #overlay>
        <a-menu>
          <a-menu-item key="reveal-explorer" @click="onReveal">在文件资源管理器中显示</a-menu-item>
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

/* 与同步角标同一套遮罩底色；z-index 低于勾选遮罩(3)，选中时随图一起压暗 */
.cell-duration {
  position: absolute;
  right: 4px;
  bottom: 4px;
  z-index: 2;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--color-bg-mask-strong);
  color: var(--color-text-light-solid);
  font-size: 11px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}
</style>
