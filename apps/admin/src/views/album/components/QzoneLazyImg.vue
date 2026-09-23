<!--
  QQ 空间媒体懒挂载：可视区再挂 src；展示与 loading 委托 ThumbVisual
  职责：滚动容器 IO + qzoneimg 协议；视觉层复用 ThumbVisual
  适用：QzoneSyncFab 封面/缩略图
-->
<script setup lang="ts">
import { qzoneProxiedSrc } from "@/api/qzoneSync";
import ThumbVisual from "./ThumbVisual.vue";

defineOptions({ name: "QzoneLazyImg" });

const props = withDefaults(
  defineProps<{
    remoteUrl: string;
    /** 滚动容器；不传则用视口 */
    scrollRoot?: HTMLElement | null;
    kind?: "thumb" | "preview";
    /** 媒体类型；决定占位图标与视频遮罩 */
    mediaKind?: "image" | "video" | "livephoto";
    /** 扩展名（不含 .）；占位时显示 */
    ext?: string;
  }>(),
  {
    kind: "thumb",
    mediaKind: "image"
  }
);

const rootRef = ref<HTMLElement | null>(null);
const show = ref(false);
let observer: IntersectionObserver | null = null;

const src = computed(() =>
  show.value && props.remoteUrl ? qzoneProxiedSrc(props.remoteUrl, props.kind) : undefined
);

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
    <ThumbVisual :src="src" :kind="mediaKind" :ext="ext" :lazy="true" />
  </div>
</template>

<style scoped lang="scss">
.qzone-lazy {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg-color-secondary, rgba(255, 255, 255, 0.08));
}
</style>
