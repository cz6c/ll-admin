<script setup lang="ts">
import { unref, computed } from "vue";
import { useFullscreen } from "@vueuse/core";
import { useRenderIcon } from "@/hooks/useRenderIcon";

defineOptions({
  name: "FoldButton"
});

const { isFullscreen, toggle } = useFullscreen(document.body);

const getIcon = computed(() => useRenderIcon(!unref(isFullscreen) ? "ri:fullscreen-fill" : "ri:fullscreen-exit-fill", { width: "18px", height: "18px" }));
</script>

<template>
  <div class="extra-fold">
    <component :is="getIcon" width="18px" height="18px" @click.stop="toggle" />
  </div>
</template>

<style lang="scss" scoped>
.extra-fold {
  display: flex;
  align-items: center;
}
</style>
