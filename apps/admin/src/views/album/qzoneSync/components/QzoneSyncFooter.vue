<!--
  QQ 空间抽屉底栏（只读）
  职责：下载 job 与删云 runner 聚合展示
-->
<script setup lang="ts">
import CloudSyncDrawerFooter from "../../cloudSync/components/CloudSyncDrawerFooter.vue";
import { useQzoneCloudDeleteRunner } from "../../cloudSync/useCloudSyncDeleteRunner";
import type { QzoneJobSnapshot } from "@/api/qzoneSync";

defineOptions({ name: "AlbumQzoneSyncFooter" });

const props = defineProps<{
  job: QzoneJobSnapshot;
  sessionActive: boolean;
  starting?: boolean;
}>();

const deleteRunner = useQzoneCloudDeleteRunner();

const showDownloadFooter = computed(() => {
  if (!props.sessionActive) return false;
  if (props.job.status === "cataloging") return false;
  if (props.starting) return true;
  return ["downloading", "paused", "done", "failed"].includes(props.job.status);
});

const visible = computed(() => {
  if (!props.sessionActive) return false;
  if (deleteRunner.showFooter.value) return true;
  return showDownloadFooter.value;
});

const downloadHeadline = computed(() => {
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
      return "下载完成";
    default:
      return props.starting ? "正在开始下载…" : "准备就绪";
  }
});

const downloadDescription = computed(() => {
  const j = props.job;
  if (j.status === "done") {
    if (j.failed > 0) return `完成 ${j.done} 项 · 失败 ${j.failed} 项`;
    return `完成 ${j.done} 项`;
  }
  if (j.status === "failed") return j.message?.trim() || "同步失败";
  if (j.status === "downloading" && j.total > 0) return `进度 ${j.done}/${j.total}`;
  return j.message?.trim() || "";
});

const percent = computed(() => {
  if (props.job.total <= 0) return 0;
  return Math.min(100, Math.round((props.job.done / props.job.total) * 100));
});

const progressStatsText = computed(() => {
  if (deleteRunner.showFooter.value) return "";
  const j = props.job;
  if (j.total <= 0) return "";
  return `完成 ${j.done} · 新增 ${j.updated} · 跳过 ${j.skipped} · 失败 ${j.failed}`;
});

const footerHeadline = computed(() => (deleteRunner.showFooter.value ? deleteRunner.statusHeadline.value : downloadHeadline.value));
const footerDescription = computed(() =>
  deleteRunner.showFooter.value ? deleteRunner.statusDescription.value : downloadDescription.value
);
const footerPercent = computed(() => (deleteRunner.showFooter.value ? deleteRunner.percent.value : percent.value));
const footerShowBar = computed(() => {
  if (deleteRunner.showFooter.value) return deleteRunner.phase.value === "running";
  return props.job.status === "downloading" && props.job.total > 0;
});
const footerShowPercent = computed(
  () => footerShowBar.value && (deleteRunner.showFooter.value ? deleteRunner.progress.value.total > 0 : props.job.total > 0)
);
const footerFailed = computed(() =>
  deleteRunner.showFooter.value ? deleteRunner.isFailedFooter.value : props.job.status === "failed"
);
</script>

<template>
  <CloudSyncDrawerFooter
    :visible="visible"
    :status-headline="footerHeadline"
    :status-description="footerDescription"
    :percent="footerPercent"
    :show-progress-bar="footerShowBar"
    :show-percent="footerShowPercent"
    :progress-stats-text="progressStatsText"
    :is-failed="footerFailed"
  />
</template>