<script setup lang="ts">
import { computed, inject, Ref, ref, useAttrs, watch } from "vue";
import { BreakPoint } from "../type";

defineOptions({
  name: "GridItem"
});

type Props = {
  offset?: number;
  span?: number;
  suffix?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
  offset: 0,
  span: 1,
  suffix: false
});

const attrs = useAttrs() as { index: string };
const isShow = ref(true);

// 注入断点
const breakPoint = inject<Ref<BreakPoint>>("breakPoint", ref("xl"));
const shouldHiddenIndex = inject<Ref<number>>("shouldHiddenIndex", ref(-1));
watch(
  () => [shouldHiddenIndex.value, breakPoint.value],
  n => {
    if (!!attrs.index) {
      isShow.value = !(n[0] !== -1 && parseInt(attrs.index) >= Number(n[0]));
    }
  },
  { immediate: true }
);

const gap = inject("gap", 0);
const cols = inject("cols", ref(4));
const style = computed(() => {
  let span = props.span;
  let offset = props.offset;
  if (props.suffix) {
    return {
      gridColumnStart: cols.value - span - offset + 1,
      gridColumnEnd: `span ${span + offset}`,
      marginLeft: offset !== 0 ? `calc(((100% + ${gap}px) / ${span + offset}) * ${offset})` : "unset"
    };
  } else {
    return {
      gridColumn: `span ${span + offset > cols.value ? cols.value : span + offset}/span ${span + offset > cols.value ? cols.value : span + offset}`,
      marginLeft: offset !== 0 ? `calc(((100% + ${gap}px) / ${span + offset}) * ${offset})` : "unset"
    };
  }
});
</script>

<template>
  <div v-show="isShow" :style="style">
    <slot />
  </div>
</template>
