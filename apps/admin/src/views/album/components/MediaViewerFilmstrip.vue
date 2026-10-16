<!--
  灯箱底部快速预览胶片条（类 iCloud 网页端）
  职责：邻域缩略图窗口 + 两侧上一张/下一张；点击缩略图跳转；不负责主图加载
  适用：MediaViewer 底栏；大数据量只渲染窗口内项，避免整库 DOM
-->
<script setup lang="ts">
import AlbumThumbMedia from "./AlbumThumbMedia.vue";
import type { FlatFile } from "../types";

const props = withDefaults(
  defineProps<{
    files: FlatFile[];
    currentIndex: number;
    canPrev?: boolean;
    canNext?: boolean;
    /** 当前项左右各保留的邻域张数；窗口总宽约 2×half+1，边缘侧向另一侧补齐 */
    halfWindow?: number;
  }>(),
  { halfWindow: 8, canPrev: false, canNext: false }
);

const emit = defineEmits<{
  select: [index: number];
  prev: [];
  next: [];
}>();

defineOptions({ name: "MediaViewerFilmstrip" });

const trackRef = ref<HTMLElement | null>(null);

/**
 * 邻域窗口起止（含 end 开区间）
 * 边缘不足时向另一侧补齐，尽量保持可见数量稳定
 */
function windowRange(len: number, idx: number, half: number): { start: number; end: number } {
  if (len <= 0) return { start: 0, end: 0 };
  const preferred = half * 2 + 1;
  let start = Math.max(0, idx - half);
  let end = Math.min(len, idx + half + 1);
  if (end - start < preferred) {
    if (start === 0) end = Math.min(len, preferred);
    else if (end === len) start = Math.max(0, len - preferred);
  }
  return { start, end };
}

const windowItems = computed(() => {
  const { start, end } = windowRange(props.files.length, props.currentIndex, props.halfWindow);
  const items: { flat: FlatFile; index: number }[] = [];
  for (let i = start; i < end; i++) {
    const flat = props.files[i];
    if (flat) items.push({ flat, index: i });
  }
  return items;
});

function onSelect(index: number) {
  if (index === props.currentIndex) return;
  emit("select", index);
}

/** 切图后把当前缩略图滚到条中心，避免邻域窗口更新后选中项偏出可视区 */
function scrollCurrentIntoView() {
  const track = trackRef.value;
  if (!track) return;
  const el = track.querySelector<HTMLElement>(".filmstrip-item.is-current");
  el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
}

watch(
  () => props.currentIndex,
  async () => {
    await nextTick();
    scrollCurrentIntoView();
  }
);

onMounted(() => {
  scrollCurrentIntoView();
});
</script>

<template>
  <div class="filmstrip" @click.stop @dblclick.stop>
    <!-- 始终占位，禁用时隐点但不卸 DOM，避免首/末张布局跳动 -->
    <a-button
      class="filmstrip-nav"
      shape="circle"
      type="text"
      title="上一张"
      aria-label="上一张"
      :disabled="!canPrev"
      :class="{ 'is-disabled': !canPrev }"
      @click="emit('prev')"
    >
      <template #icon>
        <CcIconifyIcon icon="ant-design:left-outlined" width="20" height="20" />
      </template>
    </a-button>

    <div ref="trackRef" class="filmstrip-track" role="list" aria-label="快速预览">
      <button
        v-for="item in windowItems"
        :key="item.flat.file.path"
        type="button"
        class="filmstrip-item"
        :class="{ 'is-current': item.index === currentIndex }"
        role="listitem"
        :title="item.flat.file.name"
        :aria-label="item.flat.file.name"
        :aria-current="item.index === currentIndex ? 'true' : undefined"
        @click="onSelect(item.index)"
      >
        <AlbumThumbMedia :file="item.flat.file" size="sm" />
      </button>
    </div>

    <a-button
      class="filmstrip-nav"
      shape="circle"
      type="text"
      title="下一张"
      aria-label="下一张"
      :disabled="!canNext"
      :class="{ 'is-disabled': !canNext }"
      @click="emit('next')"
    >
      <template #icon>
        <CcIconifyIcon icon="ant-design:right-outlined" width="20" height="20" />
      </template>
    </a-button>
  </div>
</template>

<style scoped lang="scss">
.filmstrip {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px 12px;
  background: linear-gradient(transparent, var(--color-bg-mask-strong));
  pointer-events: none;
}

.filmstrip-nav {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  pointer-events: auto;
  background: var(--color-overlay-hover);
  color: var(--color-text-secondary);

  &:hover:not(:disabled) {
    background: var(--color-fill);
    color: var(--color-text-light-solid);
  }

  &.is-disabled,
  &:disabled {
    opacity: 0;
    pointer-events: none;
  }
}

.filmstrip-track {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  overflow-x: auto;
  overflow-y: hidden;
  pointer-events: auto;
  scrollbar-width: thin;
}

.filmstrip-item {
  flex: 0 0 auto;
  /* 60 = 8n；灯箱胶片条专用，与宫格 targetThumb 无关 */
  width: 60px;
  height: 60px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  background: var(--color-fill);
  opacity: 0.72;
  transition:
    opacity var(--dur-fast, 0.15s) var(--ease-out, ease),
    border-color var(--dur-fast, 0.15s) var(--ease-out, ease);

  &:hover {
    opacity: 0.95;
  }

  &.is-current {
    opacity: 1;
    border-color: var(--color-text-light-solid);
  }

  :deep(.thumb-visual) {
    width: 100%;
    height: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .filmstrip-item {
    transition: none;
  }
}
</style>
