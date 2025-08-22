<script setup lang="ts">
import { useRenderIcon } from "@/hooks/useRenderIcon";
import { isFunction } from "@llcz/common";
import { useResizeObserver } from "@vueuse/core";
import type { OptionsType } from "./type";

const props = defineProps({
  options: {
    type: Array as PropType<OptionsType[]>,
    default: () => []
  },
  /** 控件尺寸 */
  size: {
    type: String as PropType<"small" | "default" | "large">
  },
  /** 是否全局禁用，默认 `false` */
  disabled: {
    type: Boolean,
    default: false
  },
  /** 当内容发生变化时，设置 `resize` 可使其自适应容器位置 */
  resize: {
    type: Boolean,
    default: false
  }
});
const modelValue = defineModel();

const emit = defineEmits(["change"]);

const segmentedRef = ref<HTMLElement | null>(null);
const width = ref(0);
const translateX = ref(0);
const initStatus = ref(false);
const curMouseActive = ref(-1);
const segmentedItembg = ref("");
const instance = getCurrentInstance();
const curIndex = computed(() => props.options.findIndex(c => c.value === modelValue.value));

function handleChange({ option, index }: { option: OptionsType; index: number }, event: Event) {
  if (props.disabled || option.disabled) return;
  event.preventDefault();
  modelValue.value = option.value;
  handleInit();
  segmentedItembg.value = "";
  emit("change", { index, option });
}

function handleMouseenter({ option, index }: { option: OptionsType; index: number }, event: Event) {
  if (props.disabled) return;
  event.preventDefault();
  curMouseActive.value = index;
  if (option.disabled || curIndex.value === index) {
    segmentedItembg.value = "";
  } else {
    segmentedItembg.value = "rgba(0, 0, 0, 0.06)";
  }
}

function handleMouseleave(_: any, event: Event) {
  if (props.disabled) return;
  event.preventDefault();
  curMouseActive.value = -1;
}

function handleInit() {
  nextTick(() => {
    const curLabelRef = instance?.proxy?.$refs[`labelRef${curIndex.value}`][0] as any;
    if (!curLabelRef) return;
    width.value = curLabelRef.clientWidth;
    translateX.value = curLabelRef.offsetLeft;
    initStatus.value = true;
  });
}

function handleResizeInit() {
  useResizeObserver(segmentedRef, () => {
    nextTick(() => {
      handleInit();
    });
  });
}

if (props.resize) {
  onMounted(() => {
    handleResizeInit();
  });
}

watch(() => props.size, handleResizeInit, {
  immediate: true
});
</script>

<template>
  <div
    ref="segmentedRef"
    class="segmented"
    :class="{
      'segmented-block': resize,
      'segmented--large': size === 'large',
      'segmented--small': size === 'small'
    }"
  >
    <div class="segmented-group">
      <div
        class="segmented-item--selected"
        :style="{
          width: `${width}px`,
          transform: `translateX(${translateX}px)`,
          display: initStatus ? 'block' : 'none'
        }"
      />
      <label
        v-for="(option, index) in options"
        :key="index"
        :ref="`labelRef${index}`"
        class="segmented-item"
        :class="{ 'segmented-item--disabled': disabled || option?.disabled }"
        :style="{
          background: curMouseActive === index ? segmentedItembg : '',
          color: disabled ? null : !option.disabled && (curIndex === index || curMouseActive === index) ? 'rgba(0,0,0,.88)' : ''
        }"
        @mouseenter="handleMouseenter({ option, index }, $event)"
        @mouseleave="handleMouseleave({ option, index }, $event)"
        @click="handleChange({ option, index }, $event)"
      >
        <input type="radio" name="segmented" />
        <div v-tippy="{ content: option?.tip }" class="segmented-item-label">
          <span v-if="option.icon" class="segmented-item-icon" :style="{ marginRight: option.label ? '6px' : 0 }">
            <component :is="useRenderIcon(option.icon, { ...option?.iconAttrs })" />
          </span>
          <span v-if="option.label">
            {{ isFunction(option.label) ? isFunction(option.label) : option.label }}
          </span>
        </div>
      </label>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "./index.css";
</style>
