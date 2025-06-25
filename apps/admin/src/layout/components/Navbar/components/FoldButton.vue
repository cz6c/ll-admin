<script setup lang="ts">
import { unref, computed } from "vue";
import { useFullscreen } from "@vueuse/core";

defineOptions({
  name: "FoldButton"
});

const { isFullscreen, toggle } = useFullscreen(document.body);

const getIcon = computed(() => (!unref(isFullscreen) ? "full_screen" : "exit_screen"));
</script>

<template>
  <div class="extra-fold">
    <SvgIcon :size="18" :name="getIcon" @click.stop="toggle" />
  </div>
</template>
