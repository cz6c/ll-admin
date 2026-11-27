<!--
  iCloud 抽屉底栏（只读）
  职责：聚合批量下载 job 与删云 runner，交给 CloudSyncDrawerFooter
-->
<script setup lang="ts">
import CloudSyncDrawerFooter from "../../cloudSync/components/CloudSyncDrawerFooter.vue";
import { useIcloudCloudDeleteRunner } from "../../cloudSync/useCloudSyncDeleteRunner";
import { useIcloudSyncJob } from "../useIcloudSyncJob";

defineOptions({ name: "AlbumIcloudSyncFooter" });

const props = defineProps<{
  /** 本抽屉会话内固定展示底栏，直至关抽屉 */
  sessionActive: boolean;
}>();

const deleteRunner = useIcloudCloudDeleteRunner();
const {
  starting,
  isCataloging,
  isCatalogTask,
  isSyncTask,
  hasActiveJob,
  isDone,
  isFailed,
  jobAccountMismatch,
  progress,
  progressPercent,
  showProgressBar,
  statusHeadline,
  statusDescription
} = useIcloudSyncJob();

const showDownloadFooter = computed(() => {
  if (!props.sessionActive) return false;
  if (isCataloging.value || isCatalogTask.value) return false;
  if (!isSyncTask.value) return false;
  if (jobAccountMismatch.value) return true;
  if (starting.value) return true;
  if (!hasActiveJob.value) return false;
  return true;
});

const visible = computed(() => {
  if (!props.sessionActive) return false;
  if (deleteRunner.showFooter.value) return true;
  return showDownloadFooter.value;
});

const progressStatsText = computed(() => {
  if (deleteRunner.showFooter.value) return "";
  const p = progress.value;
  if (p.total <= 0) return "";
  return `已下载 ${p.done} · 待下载 ${p.pending} · 失败 ${p.failed}`;
});

const footerHeadline = computed(() => (deleteRunner.showFooter.value ? deleteRunner.statusHeadline.value : statusHeadline.value));
const footerDescription = computed(() =>
  deleteRunner.showFooter.value ? deleteRunner.statusDescription.value : statusDescription.value
);
const footerPercent = computed(() => (deleteRunner.showFooter.value ? deleteRunner.percent.value : progressPercent.value));
const footerShowBar = computed(() => {
  if (deleteRunner.showFooter.value) return deleteRunner.phase.value === "running";
  return showProgressBar.value;
});
const footerShowPercent = computed(() => footerShowBar.value && (deleteRunner.showFooter.value ? deleteRunner.progress.value.total > 0 : progress.value.total > 0));
const footerFailed = computed(() => (deleteRunner.showFooter.value ? deleteRunner.isFailedFooter.value : isFailed.value && !isDone.value));
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