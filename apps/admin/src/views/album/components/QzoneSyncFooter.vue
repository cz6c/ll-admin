<!--
  QQ 空间同步忙时底栏
  职责：job 快照 → SyncJobFooter；暂停/继续/取消向外 emit
-->
<script setup lang="ts">
import SyncJobFooter from "./SyncJobFooter.vue";
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
  <SyncJobFooter
    :status-headline="statusHeadline"
    :status-description="statusDescription"
    :percent="percent"
    :show-progress-bar="showProgressBar"
    :show-percent="showProgressBar && job.total > 0"
    :progress-stats-text="progressStatsText"
    :is-failed="isFailed"
  >
    <a-button v-if="canPause" size="small" danger :loading="pausing" @click="emit('pause')">暂停</a-button>
    <a-button v-if="canResume" size="small" type="primary" :loading="resuming" @click="emit('resume')">继续</a-button>
    <a-tooltip v-if="isCataloging" title="扫描相册中，请稍候再取消">
      <a-button size="small" disabled>取消任务</a-button>
    </a-tooltip>
    <a-button v-else-if="canCancel" size="small" danger :loading="cancelling" @click="emit('cancel')">取消任务</a-button>
  </SyncJobFooter>
</template>
