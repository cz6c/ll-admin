<!--
  重复清理缩略图：进入视口后再请求生成，避免列表一次性解码/转码
  横滑后 IO root 优先用同组横向容器，并限流并发生成
  视觉层委托 ThumbVisual；本组件只保留 IO / 队列 / 尺寸壳
-->
<script setup lang="ts">
import { convertFileSrc } from "@tauri-apps/api/core";
import { resolveDuplicateThumb } from "@/api/album";
import { DUP_GROUP_HSCROLL_KEY, DUP_LIST_SCROLL_KEY } from "../duplicateListScroll";
import { enqueueDuplicateThumb } from "../duplicateThumbQueue";
import { DUP_THUMB_DISPLAY_SIZE } from "../types";
import ThumbVisual from "./ThumbVisual.vue";
import type { DuplicateFileSide } from "../types";

const props = defineProps<{
  side: DuplicateFileSide;
  isLive?: boolean;
}>();

defineOptions({ name: "DuplicateLazyThumb" });

const thumbSizePx = `${DUP_THUMB_DISPLAY_SIZE}px`;

const rootRef = ref<HTMLElement | null>(null);
const listScrollRoot = inject(DUP_LIST_SCROLL_KEY, ref<HTMLElement | null>(null));
const groupHScrollRoot = inject(DUP_GROUP_HSCROLL_KEY, ref<HTMLElement | null>(null));
const displaySrc = ref<string | null>(null);
const loading = ref(false);
const failed = ref(false);
let observer: IntersectionObserver | null = null;
let requested = false;

function canUseOriginalPath(): boolean {
  const ext = props.side.ext.toLowerCase();
  return !!props.side.path?.trim() && !["heic", "heif"].includes(ext) && !["mp4", "mov", "m4v"].includes(ext);
}

function applyCachedThumb() {
  const cached = props.side.thumbPath?.trim();
  if (cached) {
    displaySrc.value = convertFileSrc(cached);
    return true;
  }
  if (canUseOriginalPath()) {
    displaySrc.value = convertFileSrc(props.side.path);
    return true;
  }
  return false;
}

async function loadThumb() {
  if (requested || failed.value || displaySrc.value) return;
  requested = true;
  if (applyCachedThumb()) return;

  loading.value = true;
  try {
    const path = await enqueueDuplicateThumb(() => resolveDuplicateThumb(props.side.path));
    if (path?.trim()) {
      displaySrc.value = convertFileSrc(path);
    } else {
      failed.value = true;
    }
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

/**
 * 优先横滑 root（同组屏外成员不触发）；无横滑时退回纵滚列表
 * rootMargin：横滑预取左右，纵滚预取上下
 */
function setupObserver() {
  observer?.disconnect();
  observer = null;
  if (requested || displaySrc.value || failed.value) return;
  if (!rootRef.value) return;

  const hRoot = groupHScrollRoot.value;
  const vRoot = listScrollRoot.value;
  const root = hRoot ?? vRoot ?? null;
  const rootMargin = hRoot ? "0px 100px" : "120px 0px";

  observer = new IntersectionObserver(
    entries => {
      if (entries.some(e => e.isIntersecting)) {
        void loadThumb();
        observer?.disconnect();
        observer = null;
      }
    },
    { root, rootMargin }
  );
  observer.observe(rootRef.value);
}

onMounted(() => {
  if (applyCachedThumb()) return;
  // 等父级 ref（纵滚 / 横滑）挂上再 observe，避免 root=null 按视口误触发整页
  nextTick(() => setupObserver());
});

watch([listScrollRoot, groupHScrollRoot], () => {
  if (!requested && !displaySrc.value) nextTick(() => setupObserver());
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});
</script>

<template>
  <div ref="rootRef" class="dup-thumb-wrap" :style="{ width: thumbSizePx, height: thumbSizePx }">
    <a-spin v-if="loading" size="small" class="dup-thumb-spin" />
    <ThumbVisual v-else :src="displaySrc ?? undefined" :show-live-badge="!!isLive" :ext="side.ext" kind="image" size="md" :lazy="true" />
  </div>
</template>

<style scoped lang="scss">
.dup-thumb-wrap {
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  flex-shrink: 0;
}

.dup-thumb-spin {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
