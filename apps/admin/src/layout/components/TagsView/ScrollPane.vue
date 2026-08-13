<template>
  <div ref="scrollContainerRef" class="scroll-container" @wheel.prevent="handleScroll">
    <div ref="scrollWrapperRef" class="scroll-wrapper">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { useTagsViewStore } from "@/store/modules/tagsView";

const tagAndTagSpacing = ref(4);
const scrollContainerRef = ref(null);
const scrollWrapperRef = ref(null);

onMounted(() => {
  scrollWrapperRef.value?.addEventListener("scroll", emitScroll, true);
});
onBeforeUnmount(() => {
  scrollWrapperRef.value?.removeEventListener("scroll", emitScroll);
});

function handleScroll(e) {
  const eventDelta = e.wheelDelta || -e.deltaY * 40;
  const $scrollWrapper = scrollWrapperRef.value;
  if ($scrollWrapper) {
    $scrollWrapper.scrollLeft = $scrollWrapper.scrollLeft + eventDelta / 4;
  }
}
const emits = defineEmits(["scroll"]);
const emitScroll = () => {
  emits("scroll");
};

const tagsViewStore = useTagsViewStore();
const visitedViews = computed(() => tagsViewStore.visitedViews);

function moveToTarget(currentTag) {
  const $container = scrollContainerRef.value;
  const $scrollWrapper = scrollWrapperRef.value;
  if (!$container || !$scrollWrapper) return;

  const $containerWidth = $container.offsetWidth;

  let firstTag = null;
  let lastTag = null;

  // find first tag and last tag
  if (visitedViews.value.length > 0) {
    firstTag = visitedViews.value[0];
    lastTag = visitedViews.value[visitedViews.value.length - 1];
  }

  if (firstTag === currentTag) {
    $scrollWrapper.scrollLeft = 0;
  } else if (lastTag === currentTag) {
    $scrollWrapper.scrollLeft = $scrollWrapper.scrollWidth - $containerWidth;
  } else {
    const tagListDom = document.getElementsByClassName("tags-view-item");
    const currentIndex = visitedViews.value.findIndex(item => item === currentTag);
    let prevTag = null;
    let nextTag = null;
    for (const k in tagListDom) {
      if (k !== "length" && Object.hasOwnProperty.call(tagListDom, k)) {
        if (tagListDom[k].dataset.path === visitedViews.value[currentIndex - 1].path) {
          prevTag = tagListDom[k];
        }
        if (tagListDom[k].dataset.path === visitedViews.value[currentIndex + 1].path) {
          nextTag = tagListDom[k];
        }
      }
    }

    // the tag's offsetLeft after of nextTag
    const afterNextTagOffsetLeft = nextTag.offsetLeft + nextTag.offsetWidth + tagAndTagSpacing.value;

    // the tag's offsetLeft before of prevTag
    const beforePrevTagOffsetLeft = prevTag.offsetLeft - tagAndTagSpacing.value;
    if (afterNextTagOffsetLeft > $scrollWrapper.scrollLeft + $containerWidth) {
      $scrollWrapper.scrollLeft = afterNextTagOffsetLeft - $containerWidth;
    } else if (beforePrevTagOffsetLeft < $scrollWrapper.scrollLeft) {
      $scrollWrapper.scrollLeft = beforePrevTagOffsetLeft;
    }
  }
}

defineExpose({ moveToTarget });
</script>

<style lang="scss" scoped>
.scroll-container {
  white-space: nowrap;
  position: relative;
  overflow: hidden;
  width: 100%;
  height: 39px;
}

.scroll-wrapper {
  overflow-x: auto;
  overflow-y: hidden;
  height: 39px;
  /* 隐藏横向滚动条，仍可用滚轮/程序滚动 */
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
}
</style>
