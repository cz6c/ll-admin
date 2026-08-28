<!--
  iCloud 同步状态卡片（抽屉版）
  职责：状态标题 + 进度 + 同步相关操作按钮平铺展示
  适用：IcloudSyncFab 抽屉上方区域
-->
<script setup lang="ts">
import { useIcloudSyncJob } from "@/composables/useIcloudSyncJob";

defineOptions({ name: "IcloudSyncStatusCard" });

const {
  jobAccountMismatch,
  showSessionExpiredAlert,
  isDone,
  isFailed,
  hasActiveJob,
  isCataloging,
  progress,
  progressPercent,
  catalogElapsedText,
  showEmptyGuide,
  isLoggedIn,
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

/** 需展开说明的告警（账号不一致 / 会话失效 / 失败） */
const showExpandedAlert = computed(() => jobAccountMismatch.value || showSessionExpiredAlert.value || isFailed.value);

const alertType = computed(() => {
  if (jobAccountMismatch.value) return "error";
  if (showSessionExpiredAlert.value) return "warning";
  if (isDone.value) return "success";
  if (isFailed.value) return "error";
  if (isCataloging.value) return "info";
  return undefined;
});

const showProgressBar = computed(() => hasActiveJob.value && (progress.value.total > 0 || isCataloging.value));

const progressStatsText = computed(() => {
  if (isCataloging.value) return `扫描 ${catalogElapsedText.value}`;
  const p = progress.value;
  if (p.total <= 0) return "";
  return `${p.total} · 完成 ${p.done} · 待 ${p.pending} · 失败 ${p.failed}`;
});

/** 暂停已作为主按钮展示时，不再重复渲染 */
const showPauseButton = computed(() => canPause.value && primaryAction.value?.label !== "暂停同步");
</script>

<template>
  <section class="status-card">
    <a-alert
      v-if="alertType && showExpandedAlert"
      :type="alertType"
      show-icon
      class="status-alert"
      :message="statusHeadline"
      :description="statusDescription || undefined"
    />

    <template v-else>
      <div class="status-head">
        <div class="status-main">
          <span class="status-title">{{ statusHeadline }}</span>
          <a-tooltip v-if="statusDescription && isDone" :title="statusDescription">
            <span class="status-tip">详情</span>
          </a-tooltip>
        </div>
        <div class="action-row">
          <a-button
            v-if="primaryAction"
            :type="primaryAction.kind === 'danger' ? 'primary' : primaryAction.kind"
            :danger="primaryAction.kind === 'danger'"
            :loading="primaryAction.loading"
            :disabled="primaryAction.disabled"
            @click="primaryAction.handler()"
          >
            {{ primaryAction.label }}
          </a-button>
          <a-button v-if="showPauseButton" danger :loading="pausing" @click="onPause()">暂停同步</a-button>
          <a-tooltip v-if="hasActiveJob && isCataloging" title="扫描图库中，请稍候再取消">
            <a-button disabled>取消任务</a-button>
          </a-tooltip>
          <a-button v-else-if="canCancelJob" danger :loading="discarding" @click="confirmCancelJob()">取消任务</a-button>
        </div>
      </div>

      <div v-if="showProgressBar" class="progress-row">
        <a-progress
          class="progress-bar"
          :percent="isCataloging ? 0 : progressPercent"
          :status="isFailed ? 'exception' : isCataloging ? 'active' : undefined"
          size="small"
          :show-info="false"
        />
        <span v-if="!isCataloging && progress.total > 0" class="progress-percent">{{ progressPercent }}%</span>
        <span class="progress-stats">{{ progressStatsText }}</span>
      </div>

      <p v-if="showEmptyGuide" class="empty-hint">
        {{ isLoggedIn ? "点击「开始同步」拉取 iCloud 照片到本地" : "请先登录 Apple ID" }}
      </p>
    </template>
  </section>
</template>

<style scoped lang="scss">
.status-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.status-alert {
  margin-bottom: 0;
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
.status-tip {
  font-size: 12px;
  color: var(--color-primary);
  cursor: help;
  flex-shrink: 0;
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
.empty-hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.action-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}
</style>
