<script setup lang="ts">
import { useMultiFrame } from "./useMultiFrame";
import { useTagsViewStore } from "@/store/modules/tagsView";
import { type Component, shallowRef, watch, computed } from "vue";
import { type RouteRecordRaw, RouteLocationNormalizedLoaded } from "vue-router";

defineOptions({
  name: "IFrameWrap"
});

const props = defineProps<{
  currRoute: RouteLocationNormalizedLoaded;
  currComp: Component;
}>();

// IFrame 页面缓存
const keepIFrame = computed(() => {
  return !props.currRoute.meta?.noCache && !!props.currRoute.meta?.link;
});
// 正常页面组件
const normalComp = computed(() => !keepIFrame.value && props.currComp);

const compList = shallowRef([]);

const { setMap, getMap, MAP, delMap } = useMultiFrame();
// 页签改变
watch(useTagsViewStore().visitedViews, (tags: any) => {
  if (!Array.isArray(tags) || !keepIFrame.value) {
    return;
  }
  const iframeTags = tags.filter(i => i.meta?.link);
  // tags必须是小于MAP，才是做了关闭动作，因为MAP插入的顺序在tags变化后发生
  if (iframeTags.length < MAP.size) {
    for (const i of MAP.keys()) {
      if (!tags.some(s => s.path === i)) {
        delMap(i);
        compList.value = getMap();
      }
    }
  }
});
// 路由改变
watch(
  () => props.currRoute.fullPath,
  path => {
    const multiTags = useTagsViewStore().visitedViews as RouteRecordRaw[];
    const iframeTags = multiTags.filter(i => i.meta?.link);
    if (keepIFrame.value) {
      if (iframeTags.length !== MAP.size) {
        const sameKey = [...MAP.keys()].find(i => path === i);
        if (!sameKey) {
          // 添加缓存
          setMap(path, props.currComp);
        }
      }
    }

    if (MAP.size > 0) {
      compList.value = getMap();
    }
  },
  {
    immediate: true
  }
);
</script>
<template>
  <!-- 缓存多个IFrame页面 -->
  <template v-for="[fullPath, Comp] in compList" :key="fullPath">
    <div v-show="fullPath === currRoute.fullPath" class="iframe-view">
      <slot :fullPath="fullPath" :Comp="Comp" :frameInfo="{ link: currRoute.meta?.link, fullPath }" />
    </div>
  </template>
  <div v-show="!keepIFrame" class="base-view">
    <slot :Comp="normalComp" :fullPath="currRoute.fullPath" frameInfo />
  </div>
</template>
