<script setup lang="ts">
/**
 * 通用图片展示
 * 职责：基于 a-image；失败 fallback、加载占位、可选多图 PreviewGroup
 * 适用：头像、列表缩略图等
 */
import imgError from "@/assets/images/imgError.png";
import imgLoading from "@/assets/images/imgLoading.png";

defineOptions({
  name: "BaseImage"
});

const props = defineProps({
  src: {
    type: String,
    default: ""
  },
  fit: {
    type: String,
    default: "contain"
  },
  lazy: {
    type: Boolean,
    default: true
  },
  previewSrcList: {
    default: () => [] as string[]
  },
  width: {
    type: [String, Number],
    default: "100%"
  },
  height: {
    type: [String, Number],
    default: "100%"
  },
  borderRadius: {
    type: String,
    default: "none"
  },
  maxWidth: {
    type: String,
    default: ""
  },
  maxHeight: {
    type: String,
    default: ""
  }
});

const canPreview = computed(() => props.previewSrcList.length > 0);

const wrapperStyle = computed(() => ({
  width: typeof props.width === "number" ? `${props.width}px` : props.width,
  height: typeof props.height === "number" ? `${props.height}px` : props.height,
  borderRadius: props.borderRadius === "none" ? undefined : props.borderRadius,
  maxWidth: props.maxWidth || undefined,
  maxHeight: props.maxHeight || undefined,
  overflow: "hidden" as const,
  cursor: canPreview.value ? ("zoom-in" as const) : undefined
}));

const imgStyle = computed(() => ({
  objectFit: props.fit as "contain" | "cover" | "fill" | "none" | "scale-down",
  width: "100%",
  height: "100%"
}));

const displaySrc = computed(() => props.src || imgError);

const currentIndex = computed(() => {
  if (!props.src) return 0;
  const i = props.previewSrcList.findIndex(c => c === props.src);
  return i >= 0 ? i : 0;
});

const imgViewVisible = ref(false);

function onPreviewVisibleChange(vis: boolean) {
  imgViewVisible.value = vis;
}
</script>

<template>
  <div class="base-image" :style="wrapperStyle">
    <a-image-preview-group
      v-if="canPreview"
      :preview="{
        visible: imgViewVisible,
        current: currentIndex,
        onVisibleChange: onPreviewVisibleChange
      }"
    >
      <a-image
        v-for="(url, i) in previewSrcList"
        :key="`${url}-${i}`"
        :src="url"
        :fallback="imgError"
        :width="width"
        :height="height"
        :style="imgStyle"
        :wrapper-style="url === src ? { width: '100%', height: '100%' } : { display: 'none' }"
        :preview="url === src"
      >
        <template v-if="lazy && url === src" #placeholder>
          <div class="base-image__placeholder">
            <img :src="imgLoading" alt="" />
          </div>
        </template>
      </a-image>
    </a-image-preview-group>

    <a-image
      v-else
      :src="displaySrc"
      :fallback="imgError"
      :width="width"
      :height="height"
      :style="imgStyle"
      :wrapper-style="{ width: '100%', height: '100%' }"
      :preview="false"
    >
      <template v-if="lazy" #placeholder>
        <div class="base-image__placeholder">
          <img :src="imgLoading" alt="" />
        </div>
      </template>
    </a-image>
  </div>
</template>

<style scoped lang="scss">
.base-image {
  display: inline-flex;
  align-items: center;
  justify-content: center;

  :deep(.ant-image) {
    display: block;
    width: 100%;
    height: 100%;
  }

  :deep(.ant-image-img) {
    display: block;
    width: 100%;
    height: 100%;
  }

  &__placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: var(--fill-color, #f0f2f5);

    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  }
}
</style>
