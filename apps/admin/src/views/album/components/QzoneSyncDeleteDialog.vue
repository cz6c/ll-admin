<!--
  QQ 空间删云进度弹窗
  职责：对齐 IcloudSyncDeleteDialog；打开即删云并订阅进度；结果态展示；emit finished 保留失败勾选
  主流程：open → listen 进度 → deleteQzonePhotos → 结果态 → finished(keepAssetIds)
-->
<script setup lang="ts">
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  deleteQzonePhotos,
  isQzoneAuthExpiredError,
  QZONE_CLOUD_DELETE_PROGRESS_EVENT,
  type QzoneCloudDeleteProgress,
  type QzoneDeletePhotoItem,
  type QzoneDeletePhotosResult
} from "@/api/qzoneSync";

defineOptions({ name: "AlbumQzoneSyncDeleteDialog" });

const props = defineProps<{
  /** 本次要移除的项；open 置 true 时读取 */
  items: QzoneDeletePhotoItem[];
}>();

const emit = defineEmits<{
  /**
   * 删云结束（结果态出现时即触发）
   * @param keepAssetIds 未移除成功的 assetId；整体报错时为全部所选
   */
  finished: [keepAssetIds: string[]];
  /** 鉴权失效：父组件清登录态 */
  authExpired: [];
}>();

const open = defineModel<boolean>("open", { default: false });

const phase = ref<"running" | "done">("running");
const progress = ref<QzoneCloudDeleteProgress>({ processed: 0, total: 0 });
const result = ref<QzoneDeletePhotosResult | null>(null);
const errorText = ref("");

const percent = computed(() => {
  const { processed, total } = progress.value;
  return total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
});

const progressText = computed(() => {
  const { processed, total } = progress.value;
  return total > 0 ? `已处理 ${processed} / ${total} 项` : "正在连接 QQ 空间…";
});

type ResultStatus = "success" | "warning" | "error";

const summary = computed<{ status: ResultStatus; title: string; lines: string[] }>(() => {
  const r = result.value;
  if (!r) {
    return { status: "error", title: "移除失败", lines: [errorText.value || "未知错误", "所选项已保留勾选"] };
  }
  const lines: string[] = [];
  if (r.deleted > 0) lines.push(`已移除 ${r.deleted} 项（本机文件保留）`);
  if (r.failed > 0) lines.push(`失败 ${r.failed} 项：${r.message}`);
  if (r.failed > 0) lines.push("未移除的项已保留勾选，可稍后重试");

  if (r.failed === 0) return { status: "success", title: "移除完成", lines };
  if (r.deleted === 0) return { status: "error", title: "移除失败", lines };
  return { status: "warning", title: "部分项未移除", lines };
});

async function run() {
  phase.value = "running";
  progress.value = { processed: 0, total: props.items.length };
  result.value = null;
  errorText.value = "";
  const items = [...props.items];

  let unlisten: UnlistenFn | null = null;
  try {
    unlisten = await listen<QzoneCloudDeleteProgress>(QZONE_CLOUD_DELETE_PROGRESS_EVENT, event => {
      if (event.payload) progress.value = event.payload;
    });
    const res = await deleteQzonePhotos(items);
    result.value = res;
    phase.value = "done";
    emit("finished", res.failedAssetIds?.length ? [...res.failedAssetIds] : res.failed > 0 ? items.map(i => i.assetId) : []);
  } catch (e) {
    const keep = [...new Set(items.map(item => item.assetId))];
    if (isQzoneAuthExpiredError(e)) {
      open.value = false;
      emit("finished", keep);
      emit("authExpired");
      return;
    }
    errorText.value = e instanceof Error ? e.message : String(e) || "移除失败";
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
  <CcDialog v-model:open="open" title="从 QQ 空间移除" :width="420" :closable="phase === 'done'" :mask-closable="false" :keyboard="false" :footer="null">
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
