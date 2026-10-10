<!--
  云同步删云进度弹窗（双云共用）
  职责：打开即删云、订阅进度、结果态；emit finished 保留失败勾选
  适用：IcloudSyncFab / QzoneSyncFab；命令与鉴权差异由 props 注入
-->
<script setup lang="ts">
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  keepIdsFromCloudSyncDelete,
  summarizeCloudSyncDelete,
  type CloudSyncDeleteNormalizedResult,
  type CloudSyncDeleteProgress
} from "../cloudSyncDelete";

defineOptions({ name: "AlbumCloudSyncDeleteDialog" });

const props = withDefaults(
  defineProps<{
    title: string;
    /** 进度 total=0 时的连接提示 */
    connectingTip: string;
    progressEvent: string;
    items: { assetId: string }[];
    deleteFn: (items: { assetId: string }[]) => Promise<CloudSyncDeleteNormalizedResult>;
    formatError?: (e: unknown) => string;
    isAuthFailure?: (e: unknown) => boolean;
    /**
     * 鉴权失效时优先调用（如 iCloud reportBusinessError）；未传则 emit authExpired
     */
    onAuthFailure?: (e: unknown) => void | Promise<void>;
    /** iCloud「没有可删除」用 warning */
    warnOnNoDeletable?: boolean;
  }>(),
  {
    formatError: (e: unknown) => (e instanceof Error ? e.message : String(e) || "移除失败"),
    isAuthFailure: () => false,
    onAuthFailure: undefined,
    warnOnNoDeletable: false
  }
);

const emit = defineEmits<{
  finished: [keepAssetIds: string[]];
  /** 鉴权失效且未传 onAuthFailure 时通知父组件清登录态 */
  authExpired: [];
}>();

const open = defineModel<boolean>("open", { default: false });

const phase = ref<"running" | "done">("running");
const progress = ref<CloudSyncDeleteProgress>({ processed: 0, total: 0 });
const result = ref<CloudSyncDeleteNormalizedResult | null>(null);
const errorText = ref("");

const percent = computed(() => {
  const { processed, total } = progress.value;
  return total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
});

const progressText = computed(() => {
  const { processed, total } = progress.value;
  return total > 0 ? `已处理 ${processed} / ${total} 项` : props.connectingTip;
});

const summary = computed(() =>
  summarizeCloudSyncDelete(result.value, errorText.value, { warnOnNoDeletable: props.warnOnNoDeletable })
);

async function run() {
  phase.value = "running";
  progress.value = { processed: 0, total: 0 };
  result.value = null;
  errorText.value = "";
  const items = [...props.items];
  const ids = items.map(i => i.assetId);

  let unlisten: UnlistenFn | null = null;
  try {
    unlisten = await listen<CloudSyncDeleteProgress>(props.progressEvent, event => {
      if (event.payload) progress.value = event.payload;
    });
    const res = await props.deleteFn(items);
    result.value = res;
    phase.value = "done";
    emit("finished", keepIdsFromCloudSyncDelete(res, ids));
  } catch (e) {
    const keep = keepIdsFromCloudSyncDelete(null, ids);
    if (props.isAuthFailure(e)) {
      open.value = false;
      emit("finished", keep);
      if (props.onAuthFailure) await props.onAuthFailure(e);
      else emit("authExpired");
      return;
    }
    errorText.value = props.formatError(e);
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
  <CcDialog v-model:open="open" :title="title" :width="420" :closable="phase === 'done'" :mask-closable="false" :keyboard="false" :footer="null">
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
