<script setup lang="ts" name="index">
/**
 * Iconify 在线图标
 * 职责：渲染图标；业务统一使用 `ant-design:xxx`
 * @see https://icon-sets.iconify.design/ant-design/
 */
import { Icon, type IconProps } from "@iconify/vue";

defineOptions({
  name: "IconifyIcon"
});

const props = defineProps<IconProps>();
</script>

<template>
  <!-- style 放在 ...props 之后：合并默认样式且不 mutate props.style -->
  <Icon
    v-bind="{
      ...props,
      'aria-hidden': false,
      style: {
        outline: 'none',
        'vertical-align': 'middle',
        ...(typeof props.style === 'object' && props.style ? props.style : {})
      }
    }"
  />
</template>
