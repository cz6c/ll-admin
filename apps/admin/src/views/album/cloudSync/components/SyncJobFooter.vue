<!--
  云同步抽屉底栏展示壳（只读）
  职责：标题 / 进度条 / 统计 / 描述
  适用：CloudSyncDrawerFooter
-->
<script setup lang="ts">
defineOptions({ name: "AlbumSyncJobFooter" });

withDefaults(
  defineProps<{
    statusHeadline: string;
    statusDescription?: string;
    percent?: number;
    showProgressBar?: boolean;
    /** 是否显示标题旁百分比（通常 total>0） */
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
  <footer class="sync-footer" aria-live="polite">
    <div class="footer-main">
      <div class="footer-title-row">
        <span class="footer-title">{{ statusHeadline }}</span>
        <span v-if="showProgressBar && showPercent" class="footer-percent">{{ percent }}%</span>
      </div>
      <div v-if="showProgressBar" class="progress-row">
        <a-progress class="progress-bar" :percent="percent" :status="isFailed ? 'exception' : undefined" size="small" :show-info="false" />
        <span v-if="progressStatsText" class="progress-stats">{{ progressStatsText }}</span>
      </div>
      <p v-if="statusDescription" class="footer-desc">{{ statusDescription }}</p>
    </div>
  </footer>
</template>

<style scoped lang="scss">
.sync-footer {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  background: var(--color-fill-quaternary);
  border: 1px solid var(--color-border-secondary);
}
.footer-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.footer-title-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.footer-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}
.footer-percent {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
}
.progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 22px;
}
.progress-bar {
  flex: 1;
  min-width: 80px;
  margin: 0;
}
.progress-stats {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}
.footer-desc {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}
</style>
