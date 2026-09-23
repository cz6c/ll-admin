<!--
  相册缩略图画面（无定位 / 无菜单）
  职责：把 MediaFile 转成 ThumbVisual 的 props；视觉层委托 ThumbVisual
  适用：AlbumThumbCard 宫格、CaptureAtRewriteModal 小格；尺寸由父容器决定
-->
<script setup lang="ts">
import { convertFileSrc } from "@tauri-apps/api/core";
import ThumbVisual from "./ThumbVisual.vue";
import type { MediaFile } from "../types";

const props = withDefaults(
  defineProps<{
    file: MediaFile;
    /** sm：改拍摄时间弹窗小格；md：宫格默认 */
    size?: "sm" | "md";
  }>(),
  { size: "md" }
);

defineOptions({ name: "AlbumThumbMedia" });

const thumbUrl = computed(() => {
  if (!props.file.thumbPath) return undefined;
  return convertFileSrc(props.file.thumbPath);
});

/** 仅已配对 MOV 的实况展示角标，避免 kind 误判时出现空角标块 */
const showLiveBadge = computed(() => props.file.kind === "livephoto" && !!props.file.videoPath?.trim());
</script>

<template>
  <ThumbVisual :src="thumbUrl" :kind="file.kind" :ext="file.ext" :show-live-badge="showLiveBadge" :size="size" />
</template>
