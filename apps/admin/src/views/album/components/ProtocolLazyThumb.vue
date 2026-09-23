<!--
  协议缩略图懒挂载（icloudimg / qzoneimg）
  职责：滚动容器 IO 门控后再解析协议 src；视觉层委托 ThumbVisual
  适用：IcloudSyncFab 宫格、QzoneSyncFab 封面/缩略图；灯箱原图不走本组件
  @note 协议默认 rootMargin / BaseImage.lazy 不同：iCloud 半屏预取且 IO 后不再叠 lazy，避免双重延迟
-->
<script setup lang="ts">
import { icloudProxiedThumbSrc } from "@/api/icloudSync";
import { qzoneProxiedSrc } from "@/api/qzoneSync";
import ThumbVisual from "./ThumbVisual.vue";

defineOptions({ name: "ProtocolLazyThumb" });

const props = withDefaults(
  defineProps<{
    /** 协议：icloudimg（assetId）或 qzoneimg（remoteUrl） */
    protocol: "icloudimg" | "qzoneimg";
    /** iCloud：云端 assetId */
    assetId?: string;
    /** iCloud：已同步本地路径兜底（暂未用于 src，保留 props 对齐） */
    localPath?: string | null;
    /** QQ：远端图 URL */
    remoteUrl?: string;
    /** QQ：thumb / preview 档 */
    qzoneKind?: "thumb" | "preview";
    /** 滚动容器；不传则用视口 */
    scrollRoot?: HTMLElement | null;
    /** 媒体类型；决定占位图标与视频遮罩 */
    kind?: "image" | "video" | "livephoto";
    /** 扩展名（不含 .）；占位时显示 */
    ext?: string;
  }>(),
  {
    assetId: "",
    localPath: null,
    remoteUrl: "",
    qzoneKind: "thumb",
    kind: "image",
    ext: ""
  }
);

const rootRef = ref<HTMLElement | null>(null);
const show = ref(false);
let observer: IntersectionObserver | null = null;

/** iCloud 预取半屏即可；过大一次打满 sidecar 单飞队列。QQ 保持更宽预取 */
const rootMargin = computed(() => (props.protocol === "icloudimg" ? "40px 0px" : "120px 0px"));
/** iCloud 已用 IO 门控，不再叠 BaseImage lazy；QQ 仍走 lazy */
const imageLazy = computed(() => props.protocol !== "icloudimg");

const identityKey = computed(() => (props.protocol === "icloudimg" ? props.assetId : props.remoteUrl));

/**
 * 可视区后再解析协议 URL；未进入视口返回 undefined 以显示占位
 */
const resolvedSrc = computed(() => {
  if (!show.value) return undefined;
  if (props.protocol === "icloudimg") {
    if (!props.assetId) return undefined;
    return icloudProxiedThumbSrc(props.assetId);
  }
  if (!props.remoteUrl) return undefined;
  return qzoneProxiedSrc(props.remoteUrl, props.qzoneKind);
});

function setup() {
  observer?.disconnect();
  observer = null;
  show.value = false;
  if (!identityKey.value || !rootRef.value) return;

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
      rootMargin: rootMargin.value,
      threshold: 0.01
    }
  );
  observer.observe(rootRef.value);
}

onMounted(() => nextTick(setup));
watch(
  () => [props.protocol, props.assetId, props.localPath, props.remoteUrl, props.scrollRoot] as const,
  () => nextTick(setup)
);
onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});
</script>

<template>
  <div ref="rootRef" class="protocol-lazy">
    <ThumbVisual :src="resolvedSrc" :kind="kind" :ext="ext" :lazy="imageLazy" />
  </div>
</template>

<style scoped lang="scss">
.protocol-lazy {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg-color-secondary, rgba(255, 255, 255, 0.08));
}
</style>
