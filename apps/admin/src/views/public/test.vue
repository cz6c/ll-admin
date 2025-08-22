<script setup lang="ts">
defineOptions({
  name: "Test"
});
const stretch = ref("fixed");
/** 页宽 */
const stretchTypeOptions = computed(() => {
  return [
    {
      label: "固定",
      tip: "紧凑页面，轻松找到所需信息",
      value: "fixed"
    },
    {
      label: "自定义",
      tip: "最小1280、最大1600",
      value: "custom"
    },
    {
      label: "自定义",
      tip: "最小1280、最大1600",
      value: "custom1",
      disabled: true
    }
  ];
});
const stretchTypeChange = ({ option }) => {
  console.log("🚀 ~ stretchTypeChange ~ option:", option);
};
</script>

<template>
  <div class="app-page home">
    <Segmented v-model="stretch" resize class="mb-2 select-none" :options="stretchTypeOptions" @change="stretchTypeChange" />
    <Segmented v-model="stretch" class="mb-2 select-none" :options="stretchTypeOptions" @change="stretchTypeChange" />
    <Segmented v-model="stretch" class="mb-2 select-none" :options="stretchTypeOptions" @change="stretchTypeChange" />
  </div>
</template>

<style scoped lang="scss"></style>
