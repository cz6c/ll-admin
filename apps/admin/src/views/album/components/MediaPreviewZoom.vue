<!--
  灯箱内图片缩放/平移/旋转
  职责：滚轮缩放、双击放大/还原、拖拽平移、90° 旋转；工具栏 Teleport 至灯箱顶栏
  适用：MediaLightboxShell 包裹静态图；视频/Live 播放态不启用
  @note 平移与旋转/缩放分层：拖拽始终沿屏幕方向，避免 rotate 后拖动手感错位
  @note 工具栏不在图片上绘制，避免与 Live 长按播放抢操作
  @note 滚轮/按钮/缩放均以视口正中为锚点，避免随鼠标位置漂移
-->
<script setup lang="ts">
import { MEDIA_LIGHTBOX_TOOLBAR_KEY } from "./mediaLightboxContext";
import { useEventListener } from "@vueuse/core";

const props = withDefaults(
  defineProps<{
    /** 切换媒体时重置变换 */
    resetKey?: string | number | null;
    /** 灯箱是否打开；关闭时重置变换 */
    active?: boolean;
    minScale?: number;
    maxScale?: number;
    /** 工具栏步进、滚轮单次倍率 */
    step?: number;
  }>(),
  {
    resetKey: null,
    active: true,
    minScale: 1,
    maxScale: 5,
    step: 0.25
  }
);

defineOptions({ name: "MediaPreviewZoom" });

/** 挂载到灯箱顶栏，与关闭按钮对齐，避免工具栏叠在 Live 图上 */
const toolbarTarget = inject(MEDIA_LIGHTBOX_TOOLBAR_KEY, null);
const toolbarMount = computed(() => toolbarTarget?.value ?? null);

const scale = ref(1);
const rotation = ref(0);
const translateX = ref(0);
const translateY = ref(0);
const dragging = ref(false);
const transitionEnabled = ref(false);

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

const zoomRotateStyle = computed(() => ({
  transform: `rotate(${rotation.value}deg) scale(${scale.value})`,
  transition: transitionEnabled.value ? "transform 0.18s ease-out" : "none"
}));

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

/**
 * 以视口正中为锚点缩放；已有平移时同步校正 translate，保持画面中心稳定
 */
function applyScale(nextScale: number, animate = false) {
  const oldScale = scale.value;
  const clamped = clampScale(nextScale);
  if (Math.abs(clamped - oldScale) < 0.001) return;
  transitionEnabled.value = animate;
  if (clamped <= props.minScale) {
    scale.value = props.minScale;
    translateX.value = 0;
    translateY.value = 0;
    if (rotation.value % 360 === 0) rotation.value = 0;
    return;
  }
  const ratio = clamped / oldScale;
  translateX.value = ratio * translateX.value;
  translateY.value = ratio * translateY.value;
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
    resetTransform();
  }
);

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
  <div class="media-preview-zoom">
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

.media-preview-zoom__pan,
.media-preview-zoom__zoom-rotate {
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  max-height: 100%;
  will-change: transform;
}
</style>
