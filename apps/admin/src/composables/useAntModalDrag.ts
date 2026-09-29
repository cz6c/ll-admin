/**
 * Ant Design Vue Modal 标题栏拖拽（VueUse + modalRender）
 * 职责：跟踪标题位移，输出 translate 样式；限制在视口内
 * 适用：Dialog（CcDialog）；实现与 ant-design-vue Modal 官方示例一致
 * @see https://www.antdv.com/components/modal
 */
import { useDraggable } from "@vueuse/core";
import type { CSSProperties, Ref } from "vue";

/** 读取 CS 顶栏高度，拖拽时不进入顶栏区域 */
function readCsShellBarHeight(): number {
  if (typeof document === "undefined") return 0;
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cs-shell-bar-height")) || 0;
}

/**
 * 绑定 Modal 标题 ref，返回 modalRender 用的 transform 样式
 * @param modalTitleRef 标题栏拖拽手柄（须可挂载 DOM）
 * @param enabled 是否启用拖拽
 */
export function useAntModalDrag(modalTitleRef: Ref<HTMLElement | null | undefined>, enabled: Ref<boolean> | boolean = true) {
  const startX = ref(0);
  const startY = ref(0);
  const startedDrag = ref(false);
  const transformX = ref(0);
  const transformY = ref(0);
  const preTransformX = ref(0);
  const preTransformY = ref(0);
  const dragRect = ref({ left: 0, right: 0, top: 0, bottom: 0 });

  const { x, y, isDragging } = useDraggable(modalTitleRef, {
    disabled: computed(() => !unref(enabled))
  });

  watch([x, y], () => {
    if (!unref(enabled) || !modalTitleRef.value) return;
    if (!startedDrag.value) {
      startX.value = x.value;
      startY.value = y.value;
      const bodyRect = document.body.getBoundingClientRect();
      const titleRect = modalTitleRef.value.getBoundingClientRect();
      dragRect.value.left = 0;
      dragRect.value.top = readCsShellBarHeight();
      dragRect.value.right = bodyRect.width - titleRect.width;
      dragRect.value.bottom = bodyRect.height - titleRect.height;
      preTransformX.value = transformX.value;
      preTransformY.value = transformY.value;
    }
    startedDrag.value = true;
  });

  watch(isDragging, dragging => {
    if (!dragging) {
      startedDrag.value = false;
    }
  });

  watchEffect(() => {
    if (!unref(enabled) || !startedDrag.value) return;
    transformX.value =
      preTransformX.value + Math.min(Math.max(dragRect.value.left, x.value), dragRect.value.right) - startX.value;
    transformY.value =
      preTransformY.value + Math.min(Math.max(dragRect.value.top, y.value), dragRect.value.bottom) - startY.value;
  });

  /** 关闭弹窗时归零，避免非 destroyOnClose 的 Modal 位置残留 */
  function resetTransform() {
    transformX.value = 0;
    transformY.value = 0;
    preTransformX.value = 0;
    preTransformY.value = 0;
    startedDrag.value = false;
  }

  const transformStyle = computed<CSSProperties>(() => ({
    transform: `translate(${transformX.value}px, ${transformY.value}px)`
  }));

  return {
    transformStyle,
    resetTransform
  };
}
