<!--
  iCloud 网格缩略图：可视区再挂 src；统一走 icloudimg 协议
  协议层已优化：已同步图片本地原图生成缩略图（<50ms），未同步走 sidecar
  职责：滚动 IO + 列表不加载原图（原图几 MB ~ 十几 MB，整页解码会卡死）
  视觉层（占位/遮罩/角标）复用 ThumbVisual，与相册主页保持一致
  适用：IcloudSyncFab 宫格；灯箱用本地原图，不走本组件
-->
<script setup lang="ts">
import { icloudProxiedThumbSrc } from "@/api/icloudSync";
import ThumbVisual from "./ThumbVisual.vue";

defineOptions({ name: "IcloudLazyImg" });

const props = defineProps<{
  assetId: string;
  /** 已同步且盘上仍在时的绝对路径；仅用于缩略图加载失败时的兜底（暂未启用） */
  localPath?: string | null;
  /** 滚动容器；不传则用视口 */
  scrollRoot?: HTMLElement | null;
  /** 媒体类型；决定占位图标与视频遮罩 */
  kind?: "image" | "video" | "livephoto";
  /** 扩展名（不含 .）；占位时显示 */
  ext?: string;
}>();

const rootRef = ref<HTMLElement | null>(null);
const show = ref(false);
let observer: IntersectionObserver | null = null;

/** 列表统一走缩略图协议：协议层本地生成缩略图，不加载原图避免整页解码卡死 */
const resolvedSrc = computed(() => {
  if (!show.value || !props.assetId) return undefined;
  return icloudProxiedThumbSrc(props.assetId);
});

function setup() {
  observer?.disconnect();
  observer = null;
  show.value = false;
  if (!props.assetId || !rootRef.value) return;

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
      // 预取半屏即可；过大一次打满 sidecar 单飞队列
      rootMargin: "40px 0px",
      threshold: 0.01
    }
  );
  observer.observe(rootRef.value);
}

onMounted(() => nextTick(setup));
watch(
  () => [props.assetId, props.localPath, props.scrollRoot] as const,
  () => nextTick(setup)
);
onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});
</script>

<template>
  <div ref="rootRef" class="icloud-lazy">
    <!-- 已用 IO 门控，不再叠 BaseImage lazy，避免双重延迟 -->
    <ThumbVisual :src="resolvedSrc" :kind="kind" :ext="ext" :lazy="false" />
  </div>
</template>

<style scoped lang="scss">
.icloud-lazy {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg-color-secondary, rgba(0, 0, 0, 0.04));
}
</style>
