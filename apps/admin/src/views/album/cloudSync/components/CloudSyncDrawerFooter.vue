<!--
  云同步抽屉底栏（只读进度）
  职责：统一 iCloud / QQ 底栏视觉；无操作按钮
  适用：由各云 Footer 传入已算好的展示字段
-->
<script setup lang="ts">
import SyncJobFooter from "./SyncJobFooter.vue";

defineOptions({ name: "AlbumCloudSyncDrawerFooter" });

withDefaults(
  defineProps<{
    visible: boolean;
    statusHeadline: string;
    statusDescription?: string;
    percent?: number;
    showProgressBar?: boolean;
    showPercent?: boolean;
    progressStatsText?: string;
    isFailed?: boolean;
  }>(),
  {
    statusDescription: "",
    percent: 0,
    showProgressBar: false,
    showPercent: false,
    progressStatsText: "",
    isFailed: false
  }
);
</script>

<template>
  <SyncJobFooter
    v-if="visible"
    :status-headline="statusHeadline"
    :status-description="statusDescription"
    :percent="percent"
    :show-progress-bar="showProgressBar"
    :show-percent="showPercent"
    :progress-stats-text="progressStatsText"
    :is-failed="isFailed"
  />
</template>