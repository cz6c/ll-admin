<!--
  通用对话框（a-modal 薄封装）
  职责：默认 destroyOnClose；可选标题栏拖拽（VueUse + modalRender，对齐 antdv 官方）
  适用：列表编辑弹窗、应用设置等需复用 Modal 行为的场景；模板用 CcDialog；确认框可 :draggable="false"
-->
<script setup lang="ts">
import { useAntModalDrag } from "@/composables/useAntModalDrag";
import type { CSSProperties } from "vue";

defineOptions({
  name: "Dialog",
  inheritAttrs: false
});

const props = withDefaults(
  defineProps<{
    /** 对话框标题；也可用 #title 插槽完全自定义 */
    title?: string;
    /** 是否允许按住标题栏拖拽；静态 confirm 等场景可关 */
    draggable?: boolean;
  }>(),
  {
    draggable: true
  }
);

const open = defineModel<boolean>("open", { default: false });

const attrs = useAttrs();
const slots = useSlots();

const modalTitleRef = ref<HTMLElement | null>(null);
const { transformStyle, resetTransform } = useAntModalDrag(modalTitleRef, computed(() => props.draggable));

/** 拖拽时隐藏 wrap 溢出，避免拖出视口出现滚动条（antdv 官方约定） */
const wrapStyle = computed<CSSProperties>(() => {
  const incoming = (attrs.wrapStyle ?? attrs["wrap-style"]) as CSSProperties | undefined;
  return props.draggable ? { overflow: "hidden", ...incoming } : { ...incoming };
});

const passthroughAttrs = computed(() => {
  const { wrapStyle: _ws, "wrap-style": _ws2, title: _title, open: _open, ...rest } = attrs;
  return rest;
});

const useCustomTitle = computed(() => props.draggable || !!slots.title);

watch(open, value => {
  if (!value) {
    resetTransform();
  }
});
</script>

<template>
  <a-modal
    v-model:open="open"
    v-bind="passthroughAttrs"
    :wrap-style="wrapStyle"
    :title="useCustomTitle ? undefined : title"
    destroy-on-close
  >
    <template v-if="useCustomTitle" #title>
      <div v-if="draggable" ref="modalTitleRef" class="dialog-title">
        <slot name="title">{{ title }}</slot>
      </div>
      <slot v-else name="title">{{ title }}</slot>
    </template>

    <template v-if="draggable" #modalRender="{ originVNode }">
      <div :style="transformStyle">
        <component :is="originVNode" />
      </div>
    </template>

    <slot />

    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
    <template v-if="$slots.closeIcon" #closeIcon>
      <slot name="closeIcon" />
    </template>
    <template v-if="$slots.cancelText" #cancelText>
      <slot name="cancelText" />
    </template>
    <template v-if="$slots.okText" #okText>
      <slot name="okText" />
    </template>
  </a-modal>
</template>

<style scoped lang="scss">
.dialog-title {
  width: 100%;
  cursor: move;
  user-select: none;
}
</style>
