<!--
  iCloud 删云进度弹窗
  职责：打开即调用删云命令，订阅 Rust 每批推送的进度画进度条；结束后在同一弹窗展示结果（不再弹轻提示）
  主流程：open → listen 进度 → deleteIcloudSyncAssets → 结果态 → emit finished（父组件刷新列表、保留失败项勾选）
-->
<script setup lang="ts">
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  deleteIcloudSyncAssets,
  formatIcloudSyncError,
  isIcloudSessionAuthFailure,
  ICLOUD_SYNC_CLOUD_DELETE_PROGRESS_EVENT,
  type IcloudSyncCloudDeleteProgressPayload,
  type IcloudSyncDeleteAssetItem,
  type IcloudSyncDeleteAssetsResult
} from "@/api/icloudSync";
import { useIcloudSyncJob } from "@/composables/useIcloudSyncJob";

defineOptions({ name: "AlbumIcloudSyncDeleteDialog" });

const props = defineProps<{
  /** 本次要移除的项；open 置 true 时读取 */
  items: IcloudSyncDeleteAssetItem[];
}>();

const emit = defineEmits<{
  /**
   * 删云结束（结果态出现时即触发，不等用户关窗）
   * @param keepAssetIds 未移除成功的 assetId；整体报错时为全部所选
   */
  finished: [keepAssetIds: string[]];
}>();

const open = defineModel<boolean>("open", { default: false });

const { reportBusinessError } = useIcloudSyncJob();

/** running：进度条；done：结果展示 */
const phase = ref<"running" | "done">("running");
const progress = ref<IcloudSyncCloudDeleteProgressPayload>({ processed: 0, total: 0 });
const result = ref<IcloudSyncDeleteAssetsResult | null>(null);
const errorText = ref("");

const percent = computed(() => {
  const { processed, total } = progress.value;
  return total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
});

const progressText = computed(() => {
  const { processed, total } = progress.value;
  return total > 0 ? `已处理 ${processed} / ${total} 项` : "正在校验并连接 iCloud…";
});

type ResultStatus = "success" | "warning" | "error";

const summary = computed<{ status: ResultStatus; title: string; lines: string[] }>(() => {
  const r = result.value;
  if (!r) {
    // 「没有可删除…」是前置校验拦截，非真正失败
    const status: ResultStatus = errorText.value.includes("没有可删除") ? "warning" : "error";
    return { status, title: "移除失败", lines: [errorText.value, "所选项已保留勾选"] };
  }
  const lines: string[] = [];
  if (r.deleted > 0) lines.push(`已移除 ${r.deleted} 项（本机文件保留）`);
  if (r.failed > 0) lines.push(`失败 ${r.failed} 项：${r.message}`);
  if (r.rejectedLocalMissing > 0) lines.push(`${r.rejectedLocalMissing} 项本地文件缺失，已跳过`);
  if (r.rejectedMissingCpl > 0) lines.push(`${r.rejectedMissingCpl} 项缺云端元数据，已跳过`);
  const otherRejected = r.rejected - r.rejectedLocalMissing - r.rejectedMissingCpl;
  if (otherRejected > 0) lines.push(`${otherRejected} 项已跳过`);
  if (r.failed > 0 || r.rejected > 0) lines.push("未移除的项已保留勾选，可稍后重试");

  if (r.failed === 0 && r.rejected === 0) return { status: "success", title: "移除完成", lines };
  if (r.deleted === 0 && r.failed > 0) return { status: "error", title: "移除失败", lines };
  return { status: "warning", title: "部分项未移除", lines };
});

async function run() {
  phase.value = "running";
  progress.value = { processed: 0, total: 0 };
  result.value = null;
  errorText.value = "";
  const items = [...props.items];

  let unlisten: UnlistenFn | null = null;
  try {
    unlisten = await listen<IcloudSyncCloudDeleteProgressPayload>(ICLOUD_SYNC_CLOUD_DELETE_PROGRESS_EVENT, event => {
      if (event.payload) progress.value = event.payload;
    });
    const res = await deleteIcloudSyncAssets(items);
    result.value = res;
    phase.value = "done";
    emit("finished", [...res.failedAssetIds, ...res.rejectedAssetIds]);
  } catch (e) {
    const keep = [...new Set(items.map(item => item.assetId))];
    // 会话失效交给统一入口回登录面板，弹窗直接关闭，避免两处同时提示
    if (isIcloudSessionAuthFailure(e)) {
      open.value = false;
      emit("finished", keep);
      await reportBusinessError(e);
      return;
    }
    errorText.value = formatIcloudSyncError(e);
    phase.value = "done";
    emit("finished", keep);
  } finally {
    unlisten?.();
  }
}

watch(open, value => {
  if (value) void run();
});
</script>

<template>
  <CcDialog
    v-model:open="open"
    title="从 iCloud 移除"
    :width="420"
    :closable="phase === 'done'"
    :mask-closable="false"
    :keyboard="false"
    :footer="phase === 'running' ? null : undefined"
  >
    <div v-if="phase === 'running'" class="flex flex-col gap-8px py-16px">
      <a-progress :percent="percent" status="active" />
      <span class="progress-text">{{ progressText }}</span>
    </div>
    <a-result v-else class="delete-result" :status="summary.status" :title="summary.title">
      <template #subTitle>
        <div v-for="line in summary.lines" :key="line">{{ line }}</div>
      </template>
    </a-result>
  </CcDialog>
</template>

<style scoped lang="scss">
.progress-text {
  font-size: 12px;
  color: var(--color-text-tertiary);
}
.delete-result {
  padding: 16px 0 0;
}
</style>
