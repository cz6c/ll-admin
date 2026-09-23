<!--
  双云同步 FAB 共享壳
  职责：可拖 FAB（位姿 localStorage / CS 顶栏避让）+ Drawer + MediaLightboxShell 插槽托管
  适用：IcloudSyncFab / QzoneSyncFab；业务 Panel、删云、框选逻辑留在调用方
  @note 默认落点 left=左下（QQ）、right=右下（iCloud），避免两球叠在一起
-->
<script setup lang="ts">
import MediaLightboxShell from "./MediaLightboxShell.vue";
import { useDraggable, useEventListener } from "@vueuse/core";

const props = withDefaults(
  defineProps<{
    /** localStorage 键；各云独立，勿共用 */
    storageKey: string;
    /** 无存档时的默认边：left=左下，right=右下 */
    defaultEdge?: "left" | "right";
    drawerTitle: string;
    /** 追加到壳层 class `sync-fab-drawer` 之后 */
    drawerClass?: string;
    drawerWidth?: number;
    /** 灯箱打开时禁用 Drawer 键盘关闭，避免 Esc 双关 */
    lightboxOpen?: boolean;
    lightboxTitle?: string;
    lightboxMeta?: string;
    lightboxLoading?: boolean;
    lightboxLoadingTip?: string;
    lightboxCanPrev?: boolean;
    lightboxCanNext?: boolean;
  }>(),
  {
    defaultEdge: "right",
    drawerClass: "",
    drawerWidth: 1024,
    lightboxOpen: false,
    lightboxTitle: "",
    lightboxMeta: "",
    lightboxLoading: false,
    lightboxLoadingTip: "加载中…",
    lightboxCanPrev: false,
    lightboxCanNext: false
  }
);

const emit = defineEmits<{
  "lightbox-close": [];
  "lightbox-prev": [];
  "lightbox-next": [];
}>();

defineOptions({ name: "AlbumSyncFabShell" });

const drawerOpen = defineModel<boolean>("drawerOpen", { default: false });

const FAB_SIZE_PX = 58;
const FAB_EDGE_MARGIN_PX = 8;
const FAB_DRAG_CLICK_THRESHOLD_PX = 12;

const fabRootRef = ref<HTMLElement | null>(null);
/** 本轮拖动位移超阈值时不当作点击；打开抽屉改在 pointerup（避免 click 被吞） */
let fabDragOrigin = { x: 0, y: 0 };
let fabDragMoved = false;

/** CS 顶栏高度（Web 为 0）；拖动上界须避开 CsToolsBar */
function csShellBarHeightPx(): number {
  if (typeof document === "undefined") return 0;
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cs-shell-bar-height")) || 0;
}

function clampFabPos(x: number, y: number): { x: number; y: number } {
  if (typeof window === "undefined") return { x, y };
  const minY = csShellBarHeightPx() + FAB_EDGE_MARGIN_PX;
  const maxX = Math.max(FAB_EDGE_MARGIN_PX, window.innerWidth - FAB_SIZE_PX - FAB_EDGE_MARGIN_PX);
  const maxY = Math.max(minY, window.innerHeight - FAB_SIZE_PX - FAB_EDGE_MARGIN_PX);
  return {
    x: Math.min(Math.max(FAB_EDGE_MARGIN_PX, x), maxX),
    y: Math.min(Math.max(minY, y), maxY)
  };
}

function defaultFabPos(): { x: number; y: number } {
  if (typeof window === "undefined") {
    return props.defaultEdge === "left" ? { x: 24, y: 200 } : { x: 24, y: 24 };
  }
  if (props.defaultEdge === "left") {
    return clampFabPos(24, window.innerHeight - FAB_SIZE_PX - 24);
  }
  return clampFabPos(window.innerWidth - FAB_SIZE_PX - 24, window.innerHeight - FAB_SIZE_PX - 24);
}

function readStoredFabPos(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(props.storageKey);
    if (!raw) return defaultFabPos();
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return defaultFabPos();
    return clampFabPos(parsed.x, parsed.y);
  } catch {
    return defaultFabPos();
  }
}

function persistFabPos(x: number, y: number) {
  try {
    localStorage.setItem(props.storageKey, JSON.stringify({ x, y }));
  } catch {
    /* 隐私模式 / 配额满时忽略 */
  }
}

const {
  x: fabX,
  y: fabY,
  style: fabDragStyle,
  isDragging: fabDragging
} = useDraggable(fabRootRef, {
  initialValue: typeof window !== "undefined" ? readStoredFabPos() : defaultFabPos(),
  preventDefault: false,
  onStart(pos) {
    fabDragMoved = false;
    fabDragOrigin = { x: pos.x, y: pos.y };
  },
  onMove(pos) {
    const next = clampFabPos(pos.x, pos.y);
    if (next.x !== pos.x || next.y !== pos.y) {
      fabX.value = next.x;
      fabY.value = next.y;
    }
    if (Math.abs(pos.x - fabDragOrigin.x) > FAB_DRAG_CLICK_THRESHOLD_PX || Math.abs(pos.y - fabDragOrigin.y) > FAB_DRAG_CLICK_THRESHOLD_PX) {
      fabDragMoved = true;
    }
  },
  onEnd(pos) {
    const next = clampFabPos(pos.x, pos.y);
    fabX.value = next.x;
    fabY.value = next.y;
    persistFabPos(next.x, next.y);
    if (!fabDragMoved) {
      drawerOpen.value = true;
    }
  }
});

useEventListener(window, "resize", () => {
  const next = clampFabPos(fabX.value, fabY.value);
  fabX.value = next.x;
  fabY.value = next.y;
});

onMounted(() => {
  const next = readStoredFabPos();
  fabX.value = next.x;
  fabY.value = next.y;
});

const mergedDrawerClass = computed(() => {
  const extra = props.drawerClass?.trim();
  return extra ? `sync-fab-drawer ${extra}` : "sync-fab-drawer";
});
</script>

<template>
  <!-- fab 槽由调用方提供整颗按钮，保留各自状态色 / 图标样式 -->
  <div ref="fabRootRef" class="fab-root" :class="{ 'is-dragging': fabDragging }" :style="fabDragStyle">
    <slot name="fab" :dragging="fabDragging" />
  </div>

  <a-drawer
    v-model:open="drawerOpen"
    :title="drawerTitle"
    placement="right"
    :width="drawerWidth"
    :class="mergedDrawerClass"
    :keyboard="!lightboxOpen"
    :body-style="{ padding: '16px 20px', height: '100%', overflow: 'hidden' }"
  >
    <template #extra>
      <slot name="drawer-extra" />
    </template>
    <slot />
  </a-drawer>

  <MediaLightboxShell
    :open="lightboxOpen"
    :title="lightboxTitle"
    :meta="lightboxMeta"
    :loading="lightboxLoading"
    :loading-tip="lightboxLoadingTip"
    :can-prev="lightboxCanPrev"
    :can-next="lightboxCanNext"
    @close="emit('lightbox-close')"
    @prev="emit('lightbox-prev')"
    @next="emit('lightbox-next')"
  >
    <slot name="lightbox" />
  </MediaLightboxShell>
</template>

<style scoped lang="scss">
.fab-root {
  position: fixed;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  pointer-events: auto;
  touch-action: none;
  user-select: none;
  cursor: grab;
  &.is-dragging {
    cursor: grabbing;
    :deep(.fab-btn) {
      transition: none;
      transform: none;
    }
  }
}
</style>

<style lang="scss">
/* 抽屉 body 撑满视口，业务区 flex 滚动 */
.sync-fab-drawer.ant-drawer .ant-drawer-body {
  display: flex;
  flex-direction: column;
}
</style>
