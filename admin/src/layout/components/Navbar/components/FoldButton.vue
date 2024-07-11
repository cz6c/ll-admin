<template>
  <div class="extra-fold" @click="toggle">
    <SvgIcon :name="getIcon" />
  </div>
</template>
<script lang="ts" setup name="FoldButton">
import { unref, computed } from "vue";
import { useFullscreen } from "@vueuse/core";

const { isFullscreen, toggle } = useFullscreen(document.body);

const getIcon = computed(() => (!unref(isFullscreen) ? "full_screen" : "exit_screen"));
</script>
