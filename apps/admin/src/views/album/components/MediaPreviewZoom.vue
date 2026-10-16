<!--
  灯箱内图片缩放/平移/旋转
  职责：滚轮缩放、双击放大/还原、拖拽平移、90° 旋转；工具栏 Teleport 至父传入挂载点
  适用：MediaViewer 包裹静态图/Live 静帧；单独视频不启用
  @note 平移与旋转分层：拖拽始终沿屏幕方向，避免 rotate 后拖动手感错位
  @note 工具栏不在图片上绘制，避免与 Live 长按播放抢操作
  @note 放大把旋转层写成「适配尺寸 × 倍率」的像素框，子节点拉满该框。transform:scale 会糊；只抬 max-width 会在原图或内容区停住
-->
<script setup lang="ts">
import { useEventListener, useResizeObserver } from "@vueuse/core";

const props = withDefaults(
  defineProps<{
    /** 切换媒体时重置变换 */
    resetKey?: string | number | null;
    /** 灯箱是否打开；关闭时重置变换 */
    active?: boolean;
    /** 顶栏缩放工具挂载点（MediaViewer 顶栏 zoom 槽） */
    toolbarTarget?: HTMLElement | null;
    minScale?: number;
    maxScale?: number;
    /** 工具栏步进、滚轮单次倍率 */
    step?: number;
  }>(),
  {
    resetKey: null,
    active: true,
    toolbarTarget: null,
    minScale: 1,
    maxScale: 5,
    step: 0.25
  }
);

defineOptions({ name: "MediaPreviewZoom" });

/** Teleport 目标；无挂载点则不渲染顶栏工具 */
const toolbarMount = computed(() => props.toolbarTarget ?? null);

const scale = ref(1);
const rotation = ref(0);
const translateX = ref(0);
const translateY = ref(0);
const dragging = ref(false);
const transitionEnabled = ref(false);
const stageRef = ref<HTMLElement | null>(null);
/** 当前图固有像素；未读到时仍走 max 上限，避免首帧无尺寸 */
const naturalW = ref(0);
const naturalH = ref(0);
/** 100% 时放进内容区的布局宽高（不超过固有像素） */
const fitW = ref(0);
const fitH = ref(0);

const DRAG_THRESHOLD_PX = 4;

let dragOrigin = { x: 0, y: 0, tx: 0, ty: 0 };
let dragPointerId: number | null = null;
let dragPending = false;

const scaleLabel = computed(() => `${Math.round(scale.value * 100)}%`);
/** 仅放大后可拖；100% 时避免与 Live 按下播放抢事件 */
const canPan = computed(() => scale.value > props.minScale + 0.001);

const panStyle = computed(() => ({
  transform: `translate3d(${translateX.value}px, ${translateY.value}px, 0)`,
  transition: transitionEnabled.value ? "transform 0.18s ease-out" : "none"
}));

/**
 * 旋转层的像素框 = 100% 适配尺寸 × 倍率，允许大于原图像素。
 * 子节点再被拉满该框；只提高 max-width 时，布局到原图或内容区就会停。
 */
const zoomRotateStyle = computed(() => {
  const style: Record<string, string> = {
    transform: `rotate(${rotation.value}deg)`,
    transition: transitionEnabled.value ? "transform 0.18s ease-out" : "none"
  };
  if (fitW.value >= 2 && fitH.value >= 2) {
    style.width = `${fitW.value * scale.value}px`;
    style.height = `${fitH.value * scale.value}px`;
  }
  return style;
});

/** 用内容区当前像素算 100% 适配框；ratio 封顶 1，小图在 100% 时不先拉满 */
function updateFit() {
  const stage = stageRef.value;
  if (!stage || naturalW.value < 2 || naturalH.value < 2) return;
  const maxW = stage.clientWidth;
  const maxH = stage.clientHeight;
  if (maxW < 2 || maxH < 2) return;
  const ratio = Math.min(maxW / naturalW.value, maxH / naturalH.value, 1);
  fitW.value = naturalW.value * ratio;
  fitH.value = naturalH.value * ratio;
}

/** 读静帧固有尺寸。占位图不是 ant-image-img / live-photo-still，避免把 loading 图当成原图 */
function captureNatural() {
  const stage = stageRef.value;
  if (!stage) return;
  const img = stage.querySelector<HTMLImageElement>("img.ant-image-img, img.live-photo-still");
  if (!img?.complete || img.naturalWidth < 2 || img.naturalHeight < 2) return;
  naturalW.value = img.naturalWidth;
  naturalH.value = img.naturalHeight;
  updateFit();
}

/** 灯箱和全局 img 有 width:auto / max-width:100%，会把放大卡在内容区或原图像素 */
const FIT_FILL_SELECTOR = ".viewer-media, .viewer-img, .base-image, .live-container, .live-photo-player, .live-photo-frame, .live-photo-still, .ant-image, .ant-image-img, img";

function applyFittedBox() {
  const stage = stageRef.value;
  if (!stage) return;
  const ready = fitW.value >= 2 && fitH.value >= 2;
  stage.querySelectorAll<HTMLElement>(FIT_FILL_SELECTOR).forEach(el => {
    if (!ready) {
      el.style.removeProperty("width");
      el.style.removeProperty("height");
      el.style.removeProperty("max-width");
      el.style.removeProperty("max-height");
      return;
    }
    el.style.setProperty("width", "100%", "important");
    el.style.setProperty("height", "100%", "important");
    el.style.setProperty("max-width", "none", "important");
    el.style.setProperty("max-height", "none", "important");
  });
}

/** 切图 / 关闭后恢复默认视图 */
function resetTransform() {
  scale.value = props.minScale;
  rotation.value = 0;
  translateX.value = 0;
  translateY.value = 0;
  endDrag();
}

function clampScale(next: number) {
  return Math.min(props.maxScale, Math.max(props.minScale, next));
}

/** 以视口正中为锚点缩放；回到 1× 时清掉平移 */
function applyScale(nextScale: number, animate = false) {
  const clamped = clampScale(nextScale);
  if (Math.abs(clamped - scale.value) < 0.001) return;
  transitionEnabled.value = animate;
  if (clamped <= props.minScale) {
    scale.value = props.minScale;
    translateX.value = 0;
    translateY.value = 0;
    if (rotation.value % 360 === 0) rotation.value = 0;
    return;
  }
  // 布局放大围绕视口中心长大，平移是屏幕像素，不必再乘倍率
  scale.value = clamped;
}

function zoomIn() {
  applyScale(scale.value + props.step);
}

function zoomOut() {
  applyScale(scale.value - props.step);
}

function rotateLeft() {
  transitionEnabled.value = true;
  rotation.value -= 90;
}

function rotateRight() {
  transitionEnabled.value = true;
  rotation.value += 90;
}

/** 点击比例：还原缩放/旋转/平移 */
function resetView() {
  transitionEnabled.value = true;
  resetTransform();
}

function endDrag() {
  dragging.value = false;
  dragPending = false;
  dragPointerId = null;
}

function onWheel(event: WheelEvent) {
  event.preventDefault();
  event.stopPropagation();
  const delta = event.deltaY > 0 ? -props.step : props.step;
  applyScale(scale.value + delta);
}

function onPointerDown(event: PointerEvent) {
  if (!canPan.value || event.button !== 0) return;
  // 阻止浏览器默认拖图、Live 按下播放等与平移抢指针
  event.preventDefault();
  event.stopPropagation();
  dragPending = true;
  dragPointerId = event.pointerId;
  transitionEnabled.value = false;
  dragOrigin = { x: event.clientX, y: event.clientY, tx: translateX.value, ty: translateY.value };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
  if (dragPointerId !== event.pointerId) return;
  if (!dragPending && !dragging.value) return;

  const dx = event.clientX - dragOrigin.x;
  const dy = event.clientY - dragOrigin.y;

  if (dragPending) {
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    dragPending = false;
    dragging.value = true;
  }

  translateX.value = dragOrigin.tx + dx;
  translateY.value = dragOrigin.ty + dy;
}

function onPointerUp(event: PointerEvent) {
  if (dragPointerId !== event.pointerId) return;
  try {
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  } catch {
    /* 已释放 */
  }
  endDrag();
}

watch(
  () => props.resetKey,
  () => {
    transitionEnabled.value = false;
    naturalW.value = 0;
    naturalH.value = 0;
    fitW.value = 0;
    fitH.value = 0;
    resetTransform();
    void nextTick(() => captureNatural());
  }
);

watch([scale, fitW, fitH], () => {
  void nextTick(() => applyFittedBox());
});

useResizeObserver(stageRef, () => updateFit());
useEventListener(stageRef, "load", captureNatural, { capture: true });
onMounted(() => {
  void nextTick(() => captureNatural());
});

watch(
  () => props.active,
  open => {
    if (!open) resetTransform();
  }
);

// 指针移出 stage 仍跟手；防止 capture 丢失后卡住
useEventListener(window, "pointermove", onPointerMove, { passive: false });
useEventListener(window, "pointerup", onPointerUp);
useEventListener(window, "pointercancel", onPointerUp);
</script>

<template>
  <div class="media-preview-zoom" :class="{ 'is-fitted': fitW > 0 }">
    <Teleport v-if="toolbarMount" :to="toolbarMount">
      <div class="media-preview-zoom__toolbar">
        <a-space :size="0" align="center">
          <a-button-group>
            <a-button type="text" title="逆时针旋转" aria-label="逆时针旋转" @click="rotateLeft">
              <template #icon>
                <CcIconifyIcon icon="ant-design:rotate-left-outlined" width="20" height="20" />
              </template>
            </a-button>
            <a-button type="text" title="顺时针旋转" aria-label="顺时针旋转" @click="rotateRight">
              <template #icon>
                <CcIconifyIcon icon="ant-design:rotate-right-outlined" width="20" height="20" />
              </template>
            </a-button>
          </a-button-group>

          <a-button type="text" class="scale-label" title="点击还原" aria-label="还原缩放与旋转" @click="resetView">{{ scaleLabel }}</a-button>

          <a-button-group>
            <a-button type="text" title="缩小" aria-label="缩小" @click="zoomOut">
              <template #icon>
                <CcIconifyIcon icon="ant-design:zoom-out-outlined" width="20" height="20" />
              </template>
            </a-button>
            <a-button type="text" title="放大" aria-label="放大" @click="zoomIn">
              <template #icon>
                <CcIconifyIcon icon="ant-design:zoom-in-outlined" width="20" height="20" />
              </template>
            </a-button>
          </a-button-group>
        </a-space>
      </div>
    </Teleport>

    <div
      ref="stageRef"
      class="media-preview-zoom__stage"
      :class="{ 'is-grabbing': dragging, 'is-pannable': canPan }"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <div class="media-preview-zoom__pan" :style="panStyle">
        <div class="media-preview-zoom__zoom-rotate" :style="zoomRotateStyle">
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.media-preview-zoom {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.media-preview-zoom__toolbar {
  padding: 2px 4px;
  border-radius: 8px;
  background: var(--color-overlay-hover);
  backdrop-filter: blur(6px);

  :deep(.ant-btn) {
    color: var(--color-text-secondary);
    &:hover {
      color: var(--color-text-light-solid);
      background: var(--color-fill);
    }
  }

  .scale-label {
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }
}

.media-preview-zoom__stage {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
  user-select: none;
  cursor: zoom-in;

  &.is-pannable {
    cursor: grab;
  }

  &.is-grabbing {
    cursor: grabbing;
  }

  /* 禁止浏览器把 img 当链接拖走，否则平移像「没反应」 */
  :deep(img) {
    -webkit-user-drag: none;
    user-select: none;
  }

}

/* 像素框在 zoom-rotate 上；这里清掉内容区 max-width，避免子级 100% 仍被卡住 */
.media-preview-zoom.is-fitted {
  :deep(.viewer-media),
  :deep(.viewer-img),
  :deep(.base-image),
  :deep(.live-container),
  :deep(.live-photo-player),
  :deep(.live-photo-frame),
  :deep(.live-photo-still),
  :deep(.ant-image),
  :deep(.ant-image-img) {
    width: 100% !important;
    height: 100% !important;
    max-width: none !important;
    max-height: none !important;
    object-fit: contain;
  }
}

.media-preview-zoom__pan,
.media-preview-zoom__zoom-rotate {
  display: flex;
  align-items: center;
  justify-content: center;
  width: max-content;
  height: max-content;
  max-width: none;
  max-height: none;
}
</style>
