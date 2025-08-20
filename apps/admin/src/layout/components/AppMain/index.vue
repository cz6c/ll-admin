<template>
  <router-view>
    <template #default="{ Component, route }">
      <IFrameWrap :currComp="Component" :currRoute="route">
        <template #default="{ Comp, fullPath, frameInfo }">
          <Transition name="fade-transform" mode="out-in" appear>
            <keep-alive :include="tagsViewStore.cachedViews">
              <component :is="Comp" :key="fullPath" :frameInfo="frameInfo" />
            </keep-alive>
          </Transition>
        </template>
      </IFrameWrap>
    </template>
  </router-view>
</template>

<script setup lang="ts">
import { useTagsViewStore } from "@/store/modules/tagsView";
import IFrameWrap from "./IFrameWrap.vue";

defineOptions({
  name: "AppMain"
});

const tagsViewStore = useTagsViewStore();
</script>
