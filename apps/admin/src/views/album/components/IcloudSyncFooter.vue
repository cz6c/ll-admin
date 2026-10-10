<!--
  iCloud 同步忙时底栏
  职责：从 useIcloudSyncJob 取态，交给 SyncJobFooter 展示；主按钮/暂停/取消留在此
-->
<script setup lang="ts">
import SyncJobFooter from "./SyncJobFooter.vue";
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

const cardPrimary = computed(() => primaryAction.value);
/** 主按钮已是「暂停下载」时不再并列暂停 */
const showPauseButton = computed(() => canPause.value && cardPrimary.value?.label !== "暂停下载");
</script>

<template>
  <SyncJobFooter
    :status-headline="statusHeadline"
    :status-description="statusDescription"
    :percent="progressPercent"
    :show-progress-bar="showProgressBar"
    :show-percent="showProgressBar && progress.total > 0"
    :progress-stats-text="progressStatsText"
    :is-failed="isFailed"
  >
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
    <a-button v-else-if="canCancelJob" size="small" danger :loading="discarding" @click="confirmCancelJob()">取消任务</a-button>
  </SyncJobFooter>
</template>

<style scoped lang="scss">
.primary-action-wrap {
  display: inline-flex;
}
</style>
