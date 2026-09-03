/**
 * 相册目录侧栏拖拽改宽
 * 职责：pointer 拖把手更新宽度、拖中节流主区布局宽、松手持久化
 * 适用：album/index.vue 与虚拟滚动宫格配合
 */
import type { Ref } from "vue";
import { useThrottleFn } from "@vueuse/core";
import {
  ALBUM_LAYOUT,
  clampAlbumSidebarWidth,
  loadAlbumSidebarWidth,
  saveAlbumSidebarWidth
} from "./albumLayout";

/**
 * @param containerWidth 主区 scroll 实测宽度（useElementSize）；拖中节流后再驱动宫格
 */
export function useAlbumSidebarResize(containerWidth: Ref<number>) {
  const sidebarWidth = ref(loadAlbumSidebarWidth());
  const sidebarResizing = ref(false);
  /** 驱动宫格计算的容器宽：非拖拽跟 containerWidth；拖中 throttle */
  const layoutContainerWidth = ref(Math.max(0, containerWidth.value));

  watch(
    containerWidth,
    w => {
      if (!sidebarResizing.value) {
        layoutContainerWidth.value = Math.max(0, w);
      }
    },
    { immediate: true }
  );

  const flushLayoutWidth = useThrottleFn(() => {
    layoutContainerWidth.value = Math.max(0, containerWidth.value);
  }, ALBUM_LAYOUT.sidebarResizeThrottleMs);

  watch([containerWidth, sidebarResizing], () => {
    if (sidebarResizing.value) flushLayoutWidth();
  });

  let startX = 0;
  let startWidth = 0;

  function onSidebarResizeMove(ev: PointerEvent) {
    if (!sidebarResizing.value) return;
    const next = clampAlbumSidebarWidth(startWidth + (ev.clientX - startX));
    sidebarWidth.value = next;
  }

  function onSidebarResizeEnd(ev: PointerEvent) {
    if (!sidebarResizing.value) return;
    sidebarResizing.value = false;
    const el = ev.currentTarget as HTMLElement | null;
    if (el?.hasPointerCapture?.(ev.pointerId)) {
      el.releasePointerCapture(ev.pointerId);
    }
    document.body.classList.remove("album-sidebar-resizing");
    layoutContainerWidth.value = Math.max(0, containerWidth.value);
    saveAlbumSidebarWidth(sidebarWidth.value);
  }

  /**
   * 拖拽开始：capture pointer，侧栏跟手，宫格宽节流更新
   */
  function onSidebarResizeStart(ev: PointerEvent) {
    if (ev.button !== 0) return;
    ev.preventDefault();
    sidebarResizing.value = true;
    startX = ev.clientX;
    startWidth = sidebarWidth.value;
    document.body.classList.add("album-sidebar-resizing");
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
  }

  /** 双击把手恢复默认宽度 */
  function resetSidebarWidth() {
    sidebarWidth.value = clampAlbumSidebarWidth(ALBUM_LAYOUT.sidebarDefault);
    saveAlbumSidebarWidth(sidebarWidth.value);
    nextTick(() => {
      layoutContainerWidth.value = Math.max(0, containerWidth.value);
    });
  }

  return {
    sidebarWidth,
    sidebarResizing,
    layoutContainerWidth,
    onSidebarResizeStart,
    onSidebarResizeMove,
    onSidebarResizeEnd,
    resetSidebarWidth
  };
}
