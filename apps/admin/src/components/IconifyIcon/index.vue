<script setup lang="ts" name="index">
import { Icon, type IconProps } from "@iconify/vue";
// 项目默认使用图标库  `/`需要本地先导入  `:`访问外网
// https://icon-sets.iconify.design/ri/?keyword=ri
// https://icon-sets.iconify.design/ep/?keyword=ep

defineOptions({
  name: "IconifyIcon"
});

const props = defineProps<IconProps>();
</script>

<template>
  <!-- style 放在 ...props 之后：合并默认样式且不 mutate props.style（eslint vue/no-mutating-props） -->
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
