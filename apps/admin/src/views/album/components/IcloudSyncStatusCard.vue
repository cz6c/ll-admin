<!--
  iCloud 统一任务状态卡片（抽屉版）
  职责：抽屉顶部同步/catalog 任务态与主按钮；不随列表 Tab 切换
  适用：IcloudSyncFab 抽屉顶部
  @note 删云进度/成败一律由全屏浮层承接，本卡在 cloudDelete 时只保留「同步到本地」壳，不展示移除进度
  @note 失败 / 会话失效 / 账号不一致走标题+主按钮行，不用 a-alert
-->
<script setup lang="ts">
import { useIcloudSyncJob, type IcloudSyncPrimaryAction } from "@/composables/useIcloudSyncJob";

defineOptions({ name: "IcloudSyncStatusCard" });

const {
  isFailed,
  isLoggedIn,
  hasActiveJob,
  hasIncompleteTask,
  isCataloging,
  isCloudDeleteTask,
  progress,
  progressPercent,
  showProgressBar,
  primaryAction,
  canPause,
  canCancelJob,
  discarding,
  pausing,
  starting,
  onPause,
  onSyncToLocal,
  confirmCancelJob,
  statusHeadline,
  statusDescription
} = useIcloudSyncJob();

/** 删云由浮层接管：状态卡不提供取消 */
const showCancelJobButton = computed(() => canCancelJob.value && !isCloudDeleteTask.value);

const progressStatsText = computed(() => {
  const p = progress.value;
  if (p.total <= 0) return "";
  return `${p.total} · 已同步 ${p.done} · 待 ${p.pending} · 失败 ${p.failed}`;
});

/** taskType === cloudDelete：进度卡只留同步壳，不展示移除进度/文案 */
const cardHeadline = computed(() => (isCloudDeleteTask.value ? "准备就绪" : statusHeadline.value));

const cardDescription = computed(() => {
  if (isCloudDeleteTask.value) {
    return isLoggedIn.value ? "可勾选已同步项，或使用「移除全部已同步」从 iCloud 移除副本" : "";
  }
  return statusDescription.value;
});

const cardShowProgress = computed(() => !isCloudDeleteTask.value && showProgressBar.value);

const cardPrimary = computed((): IcloudSyncPrimaryAction | null => {
  if (!isCloudDeleteTask.value) return primaryAction.value;
  return {
    label: "同步到本地",
    kind: "primary",
    loading: starting.value,
    disabled: starting.value || hasIncompleteTask.value,
    tip: "将先更新 iCloud 状态，再把待同步项同步到本地",
    handler: onSyncToLocal
  };
});

const showPauseButton = computed(
  () => !isCloudDeleteTask.value && canPause.value && cardPrimary.value?.label !== "暂停同步"
);
</script>

<template>
  <section class="status-card">
    <div class="status-head">
      <div class="status-main">
        <span class="status-title">{{ cardHeadline }}</span>
      </div>
      <div class="action-row">
        <a-tooltip v-if="cardPrimary?.tip" :title="cardPrimary.tip">
          <span class="primary-action-wrap">
            <a-button
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
          :type="cardPrimary.kind === 'danger' ? 'primary' : cardPrimary.kind"
          :danger="cardPrimary.kind === 'danger'"
          :loading="cardPrimary.loading"
          :disabled="cardPrimary.disabled"
          @click="cardPrimary.handler()"
        >
          {{ cardPrimary.label }}
        </a-button>
        <a-button v-if="showPauseButton" danger :loading="pausing" @click="onPause()">暂停</a-button>
        <a-tooltip v-if="hasActiveJob && isCataloging && !isCloudDeleteTask" title="扫描图库中，请稍候再取消">
          <a-button disabled>取消任务</a-button>
        </a-tooltip>
        <a-button v-else-if="showCancelJobButton" danger :loading="discarding" @click="confirmCancelJob()">取消任务</a-button>
      </div>
    </div>

    <div v-if="cardShowProgress" class="progress-row">
      <a-progress
        class="progress-bar"
        :percent="progressPercent"
        :status="isFailed ? 'exception' : undefined"
        size="small"
        :show-info="false"
      />
      <span v-if="progress.total > 0" class="progress-percent">{{ progressPercent }}%</span>
      <span class="progress-stats">{{ progressStatsText }}</span>
    </div>

    <p v-if="cardDescription" class="status-desc">
      {{ cardDescription }}
    </p>
  </section>
</template>

<style scoped lang="scss">
.status-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.status-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.status-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding-top: 4px;
}
.status-title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
}
.status-desc {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
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
.progress-percent {
  flex-shrink: 0;
  width: 32px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text);
  text-align: right;
}
.progress-stats {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}
.action-row {
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
