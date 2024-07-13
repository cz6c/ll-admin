<template>
  <router-view :key="$route.fullPath">
    <template #default="{ Component, route }">
      <Transition name="fade-transform" mode="out-in" appear>
        <keep-alive :include="tagsViewStore.cachedViews">
          <component :is="Component" :key="route.fullPath" />
        </keep-alive>
      </Transition>
    </template>
  </router-view>
</template>

<script setup lang="ts" name="AppMain">
import { useTagsViewStore } from "@/store/modules/tagsView"

const tagsViewStore = useTagsViewStore();
</script>
