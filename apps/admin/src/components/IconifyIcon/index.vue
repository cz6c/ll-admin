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
  <Icon
    v-bind="{
      'aria-hidden': false,
      style: props?.style ? Object.assign(props.style, { outline: 'none' }) : { outline: 'none' },
      ...props
    }"
  />
</template>
