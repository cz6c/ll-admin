<!--
  QQ 空间同步忙时底栏（传输托盘）
  职责：对齐 IcloudSyncFooter；展示任务标题、进度、暂停/继续/取消
  适用：QzoneSyncFab 抽屉底部；仅 showSyncFooter 时挂载
-->
<script setup lang="ts">
import type { QzoneJobSnapshot } from "@/api/qzoneSync";

defineOptions({ name: "AlbumQzoneSyncFooter" });

const props = defineProps<{
  job: QzoneJobSnapshot;
  pausing?: boolean;
  resuming?: boolean;
  cancelling?: boolean;
}>();

const emit = defineEmits<{
  pause: [];
  resume: [];
  cancel: [];
}>();

const percent = computed(() => {
  if (props.job.total <= 0) return 0;
  return Math.min(100, Math.round((props.job.done / props.job.total) * 100));
});

const busy = computed(() => ["cataloging", "downloading", "paused"].includes(props.job.status));

const statusHeadline = computed(() => {
  switch (props.job.status) {
    case "cataloging":
      return "正在枚举相册…";
    case "downloading":
      return "正在下载到本地";
    case "paused":
      return "已暂停";
    case "failed":
      return "同步失败";
    case "done":
      return "本轮已完成";
    default:
      return "准备就绪";
  }
});

const statusDescription = computed(() => props.job.message?.trim() || "");

const progressStatsText = computed(() => {
  const j = props.job;
  if (j.total <= 0) return "";
  return `完成 ${j.done} · 新增 ${j.updated} · 跳过 ${j.skipped} · 失败 ${j.failed}`;
});

const showProgressBar = computed(() => busy.value || props.job.total > 0);
const canPause = computed(() => props.job.status === "downloading");
const canResume = computed(() => props.job.status === "paused");
const canCancel = computed(() => busy.value);
const isCataloging = computed(() => props.job.status === "cataloging");
const isFailed = computed(() => props.job.status === "failed");
</script>

<template>
  <footer class="sync-footer" aria-live="polite">
    <div class="footer-main">
      <div class="footer-title-row">
        <span class="footer-title">{{ statusHeadline }}</span>
        <span v-if="showProgressBar && job.total > 0" class="footer-percent">{{ percent }}%</span>
      </div>
      <div v-if="showProgressBar" class="progress-row">
        <a-progress class="progress-bar" :percent="percent" :status="isFailed ? 'exception' : undefined" size="small" :show-info="false" />
        <span v-if="progressStatsText" class="progress-stats">{{ progressStatsText }}</span>
      </div>
      <p v-if="statusDescription" class="footer-desc">{{ statusDescription }}</p>
    </div>
    <div class="footer-actions">
      <a-button v-if="canPause" size="small" danger :loading="pausing" @click="emit('pause')">暂停</a-button>
      <a-button v-if="canResume" size="small" type="primary" :loading="resuming" @click="emit('resume')">继续</a-button>
      <a-tooltip v-if="isCataloging" title="扫描相册中，请稍候再取消">
        <a-button size="small" disabled>取消任务</a-button>
      </a-tooltip>
      <a-button v-else-if="canCancel" size="small" danger :loading="cancelling" @click="emit('cancel')">取消任务</a-button>
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
</style>
