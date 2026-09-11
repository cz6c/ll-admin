<!--
  iCloud 网格缩略图：可视区再挂 src；本地可读图优先 convertFileSrc，否则 icloudimg
  职责：滚动 IO + 避免已同步项再打 sidecar（单飞会把整页卡死）
  适用：IcloudSyncFab 宫格 / 灯箱
-->
<script setup lang="ts">
import { convertFileSrc } from "@tauri-apps/api/core";
import { icloudProxiedThumbSrc } from "@/api/icloudSync";

defineOptions({ name: "IcloudLazyImg" });

const props = defineProps<{
  assetId: string;
  /** 已同步且盘上仍在时的绝对路径；WebView 可直接显示的格式才用 */
  localPath?: string | null;
  /** 滚动容器；不传则用视口 */
  scrollRoot?: HTMLElement | null;
}>();

const rootRef = ref<HTMLElement | null>(null);
const show = ref(false);
let observer: IntersectionObserver | null = null;

/** WebView 可直接解码的扩展名；HEIC/MOV 仍走在线 thumb */
function isWebViewImagePath(path: string): boolean {
  const clean = path.trim().split(/[?#]/)[0] ?? "";
  const ext = clean.includes(".") ? clean.slice(clean.lastIndexOf(".") + 1).toLowerCase() : "";
  return ["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(ext);
}

const resolvedSrc = computed(() => {
  if (!show.value || !props.assetId) return "";
  const local = props.localPath?.trim() ?? "";
  if (local && isWebViewImagePath(local)) {
    try {
      return convertFileSrc(local);
    } catch {
      /* fall through to online thumb */
    }
  }
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
    <BaseImage v-if="resolvedSrc" :src="resolvedSrc" fit="cover" width="100%" height="100%" :lazy="false" />
    <div v-else class="ph" />
  </div>
</template>

<style scoped lang="scss">
.icloud-lazy {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg-color-secondary, rgba(0, 0, 0, 0.04));

  :deep(.base-image) {
    width: 100%;
    height: 100%;
  }
}
.ph {
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, #f0f0f0, #e8e8e8, #f0f0f0);
  background-size: 200% 100%;
}
</style>
