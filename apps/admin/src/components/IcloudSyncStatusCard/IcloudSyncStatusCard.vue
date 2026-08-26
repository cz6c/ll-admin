<!--
  iCloud 同步状态卡片
  职责：合并告警、进度条与三指标；承载主按钮与次要操作
  适用：icloudSync.vue
-->
<script setup lang="ts">
import { useIcloudSyncJob } from "@/composables/useIcloudSyncJob";

defineOptions({ name: "IcloudSyncStatusCard" });

const {
  jobAccountMismatch,
  showSessionExpiredAlert,
  isDone,
  isFailed,
  isCataloging,
  hasActiveJob,
  progress,
  progressPercent,
  catalogElapsedText,
  showEmptyGuide,
  isLoggedIn,
  primaryAction,
  canPause,
  pausing,
  onPause,
  outputDir,
  openOutputFolder,
  statusHeadline,
  statusDescription
} = useIcloudSyncJob();

const alertType = computed(() => {
  if (jobAccountMismatch.value) return "error";
  if (showSessionExpiredAlert.value) return "warning";
  if (isDone.value) return "success";
  if (isFailed.value) return "error";
  if (isCataloging.value) return "info";
  return undefined;
});

const showProgressBar = computed(() => hasActiveJob.value && (progress.value.total > 0 || isCataloging.value));
</script>

<template>
  <section class="status-card">
    <a-alert v-if="alertType" :type="alertType" show-icon class="status-alert" :message="statusHeadline" :description="statusDescription || undefined" />

    <div v-else class="status-head">
      <h3 class="status-title">{{ statusHeadline }}</h3>
      <p v-if="statusDescription" class="status-desc">{{ statusDescription }}</p>
    </div>

    <div v-if="showProgressBar && progress.total > 0" class="progress-block">
      <a-progress :percent="progressPercent" :status="isFailed ? 'exception' : undefined" />
      <div class="progress-stats">
        <span>已完成 {{ progress.done }}</span>
        <span>待下载 {{ progress.pending }}</span>
        <span :class="{ 'text-error': progress.failed > 0 }">失败 {{ progress.failed }}</span>
      </div>
    </div>

    <div v-else-if="isCataloging" class="progress-block">
      <a-progress :percent="0" status="active" :show-info="false" />
      <div class="progress-stats">
        <span>扫描用时 {{ catalogElapsedText }}</span>
      </div>
    </div>

    <div v-if="showEmptyGuide" class="empty-steps">
      <a-steps size="small" :current="isLoggedIn ? 1 : 0" :items="[{ title: '登录' }, { title: '开始同步' }]" />
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
      <a-button v-if="canPause && primaryAction?.label !== '暂停同步'" danger :loading="pausing" @click="onPause">暂停</a-button>
      <a-button v-if="outputDir && isDone" @click="openOutputFolder">打开文件夹</a-button>
    </div>

    <p v-if="outputDir && !isDone" class="output-hint">
      落盘路径：<span class="mono">{{ outputDir }}</span>
    </p>
  </section>
</template>

<style scoped lang="scss">
.status-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.status-alert {
  margin-bottom: 0;
}
.status-head {
  .status-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }
  .status-desc {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--color-text-secondary);
  }
}
.progress-block {
  .progress-stats {
    display: flex;
    gap: 16px;
    margin-top: 6px;
    font-size: 13px;
    color: var(--color-text-secondary);
  }
}
.text-error {
  color: var(--color-error);
}
.empty-steps {
  padding: 4px 0;
}
.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.output-hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-tertiary);
  .mono {
    font-family: ui-monospace, monospace;
    word-break: break-all;
  }
}
</style>
