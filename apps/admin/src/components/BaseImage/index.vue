<script setup lang="ts">
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
    default: () => []
  },
  width: {
    type: String,
    default: "100%"
  },
  height: {
    type: String,
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

const style = computed(() => ({
  height: props.height,
  width: props.width,
  cursor: props.previewSrcList.length ? "zoom-in" : "",
  borderRadius: props.borderRadius,
  maxHeight: props.maxHeight,
  maxWidth: props.maxWidth
}));

const index = computed(() => props.previewSrcList.findIndex(c => c === props.src));

/**
 * @description 图片预览
 * */
const imgViewVisible = ref(false);
const handlePictureCardPreview = () => {
  if (props.previewSrcList.length) {
    imgViewVisible.value = true;
  }
};
</script>

<template>
  <el-image :src="props.src" :lazy="props.lazy" :fit="props.fit" :style="style" @click="handlePictureCardPreview">
    <template #placeholder>
      <img :style="style" :loading="props.lazy ? 'lazy' : 'eager'" src="@/assets/images/imgLoading.png" />
    </template>
    <template #error>
      <img :style="style" :loading="props.lazy ? 'lazy' : 'eager'" src="@/assets/images/imgError.png" />
    </template>
  </el-image>
  <el-image-viewer v-if="imgViewVisible" :url-list="previewSrcList" :initial-index="index" @close="imgViewVisible = false" />
</template>
