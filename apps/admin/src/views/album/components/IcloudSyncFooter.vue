<!--
  iCloud 同步忙时底栏（传输托盘）
  职责：替代原顶部 StatusCard；展示四态词标题、进度、暂停/继续/取消/重新开始
  适用：IcloudSyncFab 抽屉底部；仅 showSyncFooter 时挂载
-->
<script setup lang="ts">
import { useIcloudSyncJob } from "@/composables/useIcloudSyncJob";

defineOptions({ name: "AlbumIcloudSyncFooter" });

const {
  isFailed,
  isCataloging,
  progress,
  progressPercent,
  showProgressBar,
  primaryAction,
  canPause,
  canCancelJob,
  discarding,
  pausing,
  onPause,
  confirmCancelJob,
  statusHeadline,
  statusDescription
} = useIcloudSyncJob();

const progressStatsText = computed(() => {
  const p = progress.value;
  if (p.total <= 0) return "";
  return `已下载 ${p.done} · 待下载 ${p.pending} · 失败 ${p.failed}`;
});

const showCancelJobButton = computed(() => canCancelJob.value);
const cardPrimary = computed(() => primaryAction.value);
/** 主按钮已是「暂停下载」时不再并列暂停 */
const showPauseButton = computed(() => canPause.value && cardPrimary.value?.label !== "暂停下载");
</script>

<template>
  <footer class="sync-footer" aria-live="polite">
    <div class="footer-main">
      <div class="footer-title-row">
        <span class="footer-title">{{ statusHeadline }}</span>
        <span v-if="showProgressBar && progress.total > 0" class="footer-percent">{{ progressPercent }}%</span>
      </div>
      <div v-if="showProgressBar" class="progress-row">
        <a-progress class="progress-bar" :percent="progressPercent" :status="isFailed ? 'exception' : undefined" size="small" :show-info="false" />
        <span v-if="progressStatsText" class="progress-stats">{{ progressStatsText }}</span>
      </div>
      <p v-if="statusDescription" class="footer-desc">{{ statusDescription }}</p>
    </div>
    <div class="footer-actions">
      <a-tooltip v-if="cardPrimary?.tip" :title="cardPrimary.tip">
        <span class="primary-action-wrap">
          <a-button
            size="small"
            :type="cardPrimary.kind === 'danger' ? 'primary' : cardPrimary.kind"
            :danger="cardPrimary.kind === 'danger'"
            :loading="cardPrimary.loading"
            :disabled="cardPrimary.disabled"
            @click="cardPrimary.handler()"
          >
            {{ cardPrimary.label }}
          </a-button>
        </span>
      </a-tooltip>
      <a-button
        v-else-if="cardPrimary"
        size="small"
        :type="cardPrimary.kind === 'danger' ? 'primary' : cardPrimary.kind"
        :danger="cardPrimary.kind === 'danger'"
        :loading="cardPrimary.loading"
        :disabled="cardPrimary.disabled"
        @click="cardPrimary.handler()"
      >
        {{ cardPrimary.label }}
      </a-button>
      <a-button v-if="showPauseButton" size="small" danger :loading="pausing" @click="onPause()">暂停</a-button>
      <a-tooltip v-if="isCataloging" title="扫描图库中，请稍候再取消">
        <a-button size="small" disabled>取消任务</a-button>
      </a-tooltip>
      <a-button v-else-if="showCancelJobButton" size="small" danger :loading="discarding" @click="confirmCancelJob()">取消任务</a-button>
    </div>
  </footer>
</template>

<style scoped lang="scss">
.sync-footer {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
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
.footer-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}
.primary-action-wrap {
  display: inline-flex;
}
</style>
