<script setup lang="ts">
/**
 * 组件沙箱页：验证 a-segmented 等 antd 能力
 */
defineOptions({
  name: "Test"
});

const stretch = ref("fixed");

const stretchTypeOptions = [
  { label: "固定", value: "fixed", title: "紧凑页面，轻松找到所需信息" },
  { label: "自定义", value: "custom", title: "最小1280、最大1600" },
  { label: "自定义", value: "custom1", title: "最小1280、最大1600", disabled: true }
];

function stretchTypeChange(value: string | number) {
  console.log("stretchTypeChange", value);
}
</script>

<template>
  <div class="app-page home">
    <a-segmented v-model:value="stretch" class="mb-2 select-none" :options="stretchTypeOptions" @change="stretchTypeChange" />
    <a-segmented v-model:value="stretch" class="mb-2 select-none" block :options="stretchTypeOptions" @change="stretchTypeChange" />
  </div>
</template>

<style scoped lang="scss"></style>
