<template>
  <div v-loading="loading" class="iframe-page">
    <iframe ref="frameRef" :src="frameSrc" class="iframe-page__main" @load="hideLoading" />
  </div>
</template>
<script lang="ts" setup>
import { ref, computed } from "vue";
import { useRouter } from "vue-router";

const frameRef = ref<HTMLFrameElement>();

const router = useRouter();
const frameSrc = computed(() => {
  return router.currentRoute.value.meta.frameSrc as string;
});

const loading = ref(true);
function hideLoading() {
  loading.value = false;
}
</script>
<style lang="scss" scoped>
.iframe-page {
  height: 100%;

  &__main {
    overflow: hidden;
    border: 0;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
  }
}
</style>
