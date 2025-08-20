<script lang="ts" setup>
defineOptions({
  name: "IFrame"
});
const props = defineProps<{
  frameInfo?: {
    link?: string;
    fullPath?: string;
  };
}>();

const loading = ref(true);
const currentRoute = useRoute();
const frameRef = ref<HTMLElement | null>(null);
const frameSrc = ref<string>(props.frameInfo.link);

function hideLoading() {
  loading.value = false;
}

function init() {
  nextTick(() => {
    const iframe = unref(frameRef);
    if (!iframe) return;
    const _frame = iframe as any;
    if (_frame.attachEvent) {
      _frame.attachEvent("onload", () => {
        hideLoading();
      });
    } else {
      iframe.onload = () => {
        hideLoading();
      };
    }
  });
}

watch(
  () => currentRoute.fullPath,
  path => {
    if (currentRoute.name === "Redirect" && path.includes(props.frameInfo?.fullPath)) {
      frameSrc.value = path; // redirect时，置换成任意值，待重定向后 重新赋值
      loading.value = true;
    }
    // 重新赋值
    if (props.frameInfo?.fullPath === path) {
      frameSrc.value = props.frameInfo?.link;
    }
  }
);

onMounted(() => {
  init();
});
</script>

<template>
  <div v-loading="loading" element-loading-text="加载中..." class="app-page">
    <iframe ref="frameRef" :src="frameSrc" class="iframe-page" />
  </div>
</template>

<style lang="scss" scoped>
.iframe-page {
  overflow: hidden;
  border: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}
</style>
