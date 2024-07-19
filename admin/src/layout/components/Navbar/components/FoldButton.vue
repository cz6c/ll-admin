<template>
  <div class="extra-fold">
    <SvgIcon :size="18" :name="getIcon" @click.stop="toggle" />
  </div>
</template>
<script lang="ts" setup name="FoldButton">
import { unref, computed } from "vue";
import { useFullscreen } from "@vueuse/core";

const { isFullscreen, toggle } = useFullscreen(document.body);

const getIcon = computed(() => (!unref(isFullscreen) ? "full_screen" : "exit_screen"));
</script>
