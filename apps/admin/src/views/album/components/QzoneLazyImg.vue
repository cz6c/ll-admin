<!--
  QQ 空间媒体懒挂载：可视区再挂 src；展示与 loading 委托 BaseImage
  职责：滚动容器 IO + qzoneimg 协议；不重复造加载占位
  适用：QzoneSyncFab 封面/缩略图
-->
<script setup lang="ts">
import { qzoneProxiedSrc } from "@/api/qzoneSync";

defineOptions({ name: "QzoneLazyImg" });

const props = withDefaults(
  defineProps<{
    remoteUrl: string;
    /** 滚动容器；不传则用视口 */
    scrollRoot?: HTMLElement | null;
    kind?: "thumb" | "preview";
  }>(),
  {
    kind: "thumb"
  }
);

const rootRef = ref<HTMLElement | null>(null);
const show = ref(false);
let observer: IntersectionObserver | null = null;

const src = computed(() => (show.value && props.remoteUrl ? qzoneProxiedSrc(props.remoteUrl, props.kind) : ""));

function setup() {
  observer?.disconnect();
  observer = null;
  show.value = false;
  if (!props.remoteUrl || !rootRef.value) return;

  observer = new IntersectionObserver(
    entries => {
      for (const e of entries) {
        if (e.isIntersecting) {
          show.value = true;
          observer?.disconnect();
          observer = null;
          break;
        }
      }
    },
    {
      root: props.scrollRoot ?? null,
      rootMargin: "120px 0px",
      threshold: 0.01
    }
  );
  observer.observe(rootRef.value);
}

onMounted(() => nextTick(setup));
watch(
  () => [props.remoteUrl, props.scrollRoot] as const,
  () => nextTick(setup)
);
onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});
</script>

<template>
  <div ref="rootRef" class="qzone-lazy">
    <BaseImage v-if="src" :src="src" fit="cover" width="100%" height="100%" :lazy="true" />
    <div v-else class="ph" />
  </div>
</template>

<style scoped lang="scss">
.qzone-lazy {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg-color-secondary, rgba(0, 0, 0, 0.04));

  :deep(.base-image) {
    width: 100%;
    height: 100%;
    display: block;
  }
}
.ph {
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, #f0f0f0, #e8e8e8, #f0f0f0);
  background-size: 200% 100%;
}
</style>
