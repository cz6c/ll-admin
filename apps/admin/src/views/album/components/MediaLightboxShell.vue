<!--
  全屏媒体灯箱壳
  职责：遮罩、关闭、左右导航、底栏标题/元信息、Esc/方向键；媒体区用默认插槽
  适用：MediaViewer（本地相册）、IcloudSyncFab / QzoneSyncFab（同步抽屉）
  @note 样式以原 MediaViewer 为唯一来源；业务媒体渲染留在各调用方
  @note Teleport body：同步抽屉内预览须盖住 a-drawer（同级 z-index 会被夹住）
  @note 相册强制暗黑：遮罩/控件按暗色灯箱绘制，不跟随浅色 :root
-->
<script setup lang="ts">
import { useEventListener } from "@vueuse/core";

const props = withDefaults(
  defineProps<{
    open: boolean;
    /** 底部主标题（文件名） */
    title?: string;
    /** 底部次要信息 */
    meta?: string;
    loading?: boolean;
    loadingTip?: string;
    canPrev?: boolean;
    canNext?: boolean;
  }>(),
  {
    title: "",
    meta: "",
    loading: false,
    loadingTip: "加载中…",
    canPrev: false,
    canNext: false
  }
);

const emit = defineEmits<{
  close: [];
  prev: [];
  next: [];
}>();

defineOptions({ name: "MediaLightboxShell" });

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return;
  switch (e.key) {
    case "Escape":
      e.preventDefault();
      e.stopPropagation();
      emit("close");
      break;
    case "ArrowLeft":
      if (props.canPrev) emit("prev");
      break;
    case "ArrowRight":
      if (props.canNext) emit("next");
      break;
    default:
      break;
  }
}

useEventListener(window, "keydown", onKeydown, { capture: true });
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="viewer-overlay" role="dialog" aria-modal="true" :aria-label="title || '预览'" @click="emit('close')">
      <a-button class="viewer-close" shape="circle" type="text" title="关闭 (Esc)" @click.stop="emit('close')">
        <template #icon>
          <IconifyIcon icon="ant-design:close-outlined" width="20" height="20" />
        </template>
      </a-button>

      <!-- 始终占位，禁用时隐藏点击但不卸 DOM，避免切到首/末张时按钮显隐跳动 -->
      <a-button
        class="viewer-nav viewer-prev"
        shape="circle"
        type="text"
        title="上一张"
        :disabled="!canPrev"
        :class="{ 'is-disabled': !canPrev }"
        @click.stop="emit('prev')"
      >
        <template #icon>
          <IconifyIcon icon="ant-design:left-outlined" width="24" height="24" />
        </template>
      </a-button>

      <a-button
        class="viewer-nav viewer-next"
        shape="circle"
        type="text"
        title="下一张"
        :disabled="!canNext"
        :class="{ 'is-disabled': !canNext }"
        @click.stop="emit('next')"
      >
        <template #icon>
          <IconifyIcon icon="ant-design:right-outlined" width="24" height="24" />
        </template>
      </a-button>

      <div class="viewer-content" @click.stop>
        <a-spin :spinning="loading" :tip="loadingTip">
          <slot />
        </a-spin>
      </div>

      <div v-if="title || meta" class="viewer-info" @click.stop>
        <span v-if="title" class="info-name">{{ title }}</span>
        <span v-if="meta" class="info-meta">{{ meta }}</span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.viewer-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  /* 相册灯箱深底衬媒体，避免浅罩抢对比 */
  background: var(--color-bg-spotlight);
}
.viewer-close {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 2;
  width: 40px;
  height: 40px;
  background: var(--color-overlay-hover);
  color: var(--color-text-secondary);
  &:hover {
    background: var(--color-fill);
    color: var(--color-text-light-solid);
  }
}
.viewer-nav {
  position: absolute;
  top: 50%;
  /* 不用 transform 垂直居中：antd 按下态也会改 transform，叠加后点击会跳 */
  margin-top: -24px;
  z-index: 2;
  width: 48px;
  height: 48px;
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
.viewer-prev {
  left: 16px;
}
.viewer-next {
  right: 16px;
}
.viewer-content {
  width: 90vw;
  max-width: 90vw;
  height: 85vh;
  max-height: 85vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  :deep(.ant-spin-nested-loading),
  :deep(.ant-spin-container) {
    width: 100%;
    height: 100%;
    max-width: 90vw;
    max-height: 85vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}
.viewer-info {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 2;
  padding: 12px 20px;
  background: linear-gradient(transparent, var(--color-bg-mask-strong));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.info-name {
  color: var(--color-text);
  font-size: 13px;
  font-weight: 500;
  max-width: 80vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.info-meta {
  color: var(--color-text-tertiary);
  font-size: 12px;
}

/* 调用方媒体统一尺寸上限（与原 MediaViewer .viewer-media 一致） */
:deep(.viewer-media) {
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 4px;
}
:deep(.viewer-img) {
  display: flex;
  align-items: center;
  justify-content: center;

  &.base-image,
  .base-image {
    max-width: 90vw;
    max-height: 85vh;
  }

  .ant-image-img {
    max-width: 90vw;
    max-height: 85vh;
    object-fit: contain;
  }
}
</style>
