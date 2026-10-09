<!--
  Finder 文件夹字形（参考图铬层 1:1）
  职责：动态封面垫在照片孔；上方叠 folderChrome.png（从特写参考抠出的黄夹）
  适用：AlbumFileBrowser
-->
<script setup lang="ts">
import folderChromeUrl from "../assets/folderChrome.png";

defineOptions({ name: "AlbumFolderGlyph" });

defineProps<{
  /** 封面图 URL；空则孔内显示底色 */
  coverSrc?: string;
}>();

/**
 * 照片孔相对铬层图（285×223）的比例
 * 孔：folderChromeSlot (40,52)-(248,128)；高度加长伸入前襟下形成夹入
 */
const SLOT = {
  left: "14.04%",
  top: "23.32%",
  width: "72.98%",
  height: "50%"
} as const;
</script>

<template>
  <span class="folder-glyph">
    <span class="cover-slot" :style="SLOT">
      <CcImage v-if="coverSrc" class="cover-img" :src="coverSrc" fit="cover" width="100%" height="100%" :lazy="true" />
    </span>
    <img class="folder-chrome" :src="folderChromeUrl" alt="" draggable="false" />
  </span>
</template>

<style scoped lang="scss">
.folder-glyph {
  position: relative;
  display: block;
  width: 100%;
  /* 与 folderChrome.png 同比例 */
  aspect-ratio: 285 / 223;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
}

.cover-slot {
  position: absolute;
  z-index: 0;
  overflow: hidden;
  border-radius: 3px;
  background: #5a4018;
}

.cover-img {
  display: block;
  width: 100%;
  height: 100%;
}

.folder-chrome {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
  user-select: none;
}
</style>
